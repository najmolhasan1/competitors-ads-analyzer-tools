import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { metaToken, metaAccountId, datePreset = 'last_30d', startDate, endDate } = await request.json();

    if (!metaToken || !metaAccountId) {
      return NextResponse.json({ error: 'Meta Token and Ad Account ID are required' }, { status: 400 });
    }

    const cleanAccountId = metaAccountId.trim().startsWith('act_') 
      ? metaAccountId.trim() 
      : `act_${metaAccountId.trim()}`;

    let dateParam = '';
    if (startDate && endDate) {
      dateParam = `time_range=${encodeURIComponent(JSON.stringify({ since: startDate, until: endDate }))}`;
    } else {
      dateParam = `date_preset=${datePreset}`;
    }

    // 1. Fetch campaigns details
    const campaignsListUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/campaigns?fields=id,name,status,objective,created_time,daily_budget,lifetime_budget,buying_type&limit=500&access_token=${metaToken}`;

    // 2. Fetch campaign insights
    const campaignsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=campaign_id,spend,impressions,clicks,cpc,ctr,actions,action_values&${dateParam}&level=campaign&limit=500&access_token=${metaToken}`;
    
    // 3. Fetch adsets details (including targeting and budgets)
    const adsetsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/adsets?fields=id,name,status,campaign{id},created_time,daily_budget,lifetime_budget,targeting,destination_type&limit=500&access_token=${metaToken}`;

    // 4. Fetch adset insights
    const adsetsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=adset_id,spend,impressions,clicks,cpc,ctr,actions,action_values&${dateParam}&level=adset&limit=500&access_token=${metaToken}`;

    // 5. Fetch ad insights
    const adsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=ad_id,ad_name,campaign_id,campaign_name,adset_id,spend,impressions,clicks,cpc,ctr,actions,action_values&${dateParam}&level=ad&limit=500&access_token=${metaToken}`;

    // 6. Fetch ads creatives
    const adsListingUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/ads?fields=id,name,status,effective_status,campaign{id,name},adset{id,name},creative{id,title,body,image_url,thumbnail_url,video_data_hover_url,video_id,video_data,object_story_spec,asset_feed_spec,effective_object_story_id}&limit=500&access_token=${metaToken}`;

    const [campListRes, campInsRes, adsetListRes, adsetInsRes, adsInsRes, adsListRes] = await Promise.all([
      fetch(campaignsListUrl),
      fetch(campaignsInsightsUrl),
      fetch(adsetsUrl),
      fetch(adsetsInsightsUrl),
      fetch(adsInsightsUrl),
      fetch(adsListingUrl)
    ]);

    if (!campInsRes.ok) {
      const err = await campInsRes.json();
      return NextResponse.json({ error: `Meta API Error (Insights): ${err.error?.message || campInsRes.statusText}` }, { status: campInsRes.status });
    }

    const campaignsListData = campListRes.ok ? await campListRes.json() : { data: [] };
    const campaignsInsightsData = await campInsRes.json();
    const adsetsListData = adsetListRes.ok ? await adsetListRes.json() : { data: [] };
    const adsetsInsightsData = adsetInsRes.ok ? await adsetInsRes.json() : { data: [] };
    const adsInsightsData = adsInsRes.ok ? await adsInsRes.json() : { data: [] };
    const adsListingData = adsListRes.ok ? await adsListRes.json() : { data: [] };

    try {
      const fs = require('fs');
      const path = require('path');
      fs.writeFileSync(
        path.join(process.cwd(), 'creative_debug.json'),
        JSON.stringify(adsListingData.data ? adsListingData.data.slice(0, 10) : adsListingData, null, 2)
      );
    } catch (e) {}

    const campaignsList = campaignsListData.data || [];
    const campaignInsights = campaignsInsightsData.data || [];
    const adsetsList = adsetsListData.data || [];
    const adsetInsights = adsetsInsightsData.data || [];
    const adInsights = adsInsightsData.data || [];
    const adListings = adsListingData.data || [];

    // Fetch details for page posts (effective_object_story_id) and videos (video_id) in batch
    const idTypeMap = {};
    adListings.forEach(ad => {
      const creative = ad.creative || {};
      if (creative.effective_object_story_id && creative.effective_object_story_id !== '0') {
        const id = creative.effective_object_story_id;
        idTypeMap[id] = 'story';
      }
      if (creative.video_id && creative.video_id !== '0') {
        const id = creative.video_id;
        if (!idTypeMap[id]) idTypeMap[id] = 'video';
      }
    });

    const uniqueIds = Object.keys(idTypeMap).filter(Boolean);
    const storyIdDataMap = {};
    
    if (uniqueIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < uniqueIds.length; i += 50) {
        chunks.push(uniqueIds.slice(i, i + 50));
      }

      for (const chunk of chunks) {
        const batchOps = chunk.map(id => {
          const type = idTypeMap[id];
          const fields = type === 'video' 
            ? 'picture,source' 
            : 'full_picture,picture,attachments{media_type,media,subattachments}';
          return {
            method: 'GET',
            relative_url: `${id}?fields=${fields}`
          };
        });

        try {
          const params = new URLSearchParams();
          params.append('access_token', metaToken);
          params.append('batch', JSON.stringify(batchOps));

          const batchRes = await fetch('https://graph.facebook.com', {
            method: 'POST',
            body: params
          });

          if (batchRes.ok) {
            const batchResult = await batchRes.json();
            if (Array.isArray(batchResult)) {
              chunk.forEach((id, idx) => {
                const resObj = batchResult[idx];
                if (resObj && resObj.code === 200) {
                  try {
                    const postData = JSON.parse(resObj.body);
                    storyIdDataMap[id] = postData;
                  } catch (e) {}
                }
              });
            }
          }
        } catch (e) {}
      }
    }

    // Helper to parse actions (conversions)
    const parseActions = (actions = [], actionValues = []) => {
      let purchases = 0;
      let purchaseValue = 0;

      actions.forEach(act => {
        if (
          act.action_type === 'purchase' || 
          act.action_type === 'offsite_conversion.fb_pixel_purchase' ||
          act.action_type === 'onsite_conversion.messaging_purchase_conversations'
        ) {
          purchases += parseInt(act.value || 0);
        }
      });

      actionValues.forEach(val => {
        if (
          val.action_type === 'purchase' || 
          val.action_type === 'offsite_conversion.fb_pixel_purchase' ||
          val.action_type === 'onsite_conversion.messaging_purchase_conversations'
        ) {
          purchaseValue += parseFloat(val.value || 0);
        }
      });

      return { purchases, purchaseValue };
    };

    // Helper to parse adset targeting into human readable text
    const parseTargeting = (t = {}) => {
      const geo = t.geo_locations || {};
      const countries = geo.countries || [];
      const locationStr = countries.length > 0 ? countries.join(', ') : 'Global / Selected Regions';
      
      const ageMin = t.age_min || 18;
      const ageMax = t.age_max || '65+';
      const ageStr = `${ageMin} - ${ageMax}`;
      
      let genderStr = 'All';
      if (t.genders) {
        if (t.genders.includes(1) && t.genders.includes(2)) genderStr = 'All';
        else if (t.genders.includes(1)) genderStr = 'Men';
        else if (t.genders.includes(2)) genderStr = 'Women';
      }
      
      let interests = [];
      if (t.flexible_spec && Array.isArray(t.flexible_spec)) {
        t.flexible_spec.forEach(spec => {
          if (spec.interests && Array.isArray(spec.interests)) {
            spec.interests.forEach(i => {
              if (i.name) interests.push(i.name);
            });
          }
        });
      }
      const interestsStr = interests.length > 0 ? interests.slice(0, 3).join(', ') : 'Broad Audiences';

      const platforms = t.publisher_platforms || [];
      let platformStr = 'All Placements (Automatic)';
      if (platforms.length > 0) {
        platformStr = platforms.map(p => {
          if (p === 'facebook') return 'Facebook';
          if (p === 'instagram') return 'Instagram';
          if (p === 'messenger') return 'Messenger';
          if (p === 'audience_network') return 'Audience Network';
          return p.charAt(0).toUpperCase() + p.slice(1);
        }).join(', ');
      }

      return {
        locations: locationStr,
        age: ageStr,
        gender: genderStr,
        interests: interestsStr,
        placements: platformStr
      };
    };

    // Map campaign insights
    const campInsightsMap = {};
    campaignInsights.forEach(c => {
      campInsightsMap[c.campaign_id] = c;
    });

    // 1. Build campaigns array
    const campaigns = campaignsList.map(c => {
      const ins = campInsightsMap[c.id] || {};
      const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
      const spend = parseFloat(ins.spend || 0);
      
      // Determine budget CBO vs ABO
      let budgetType = 'ABO (AdSet)';
      let budgetValue = 0;
      if (c.daily_budget && parseInt(c.daily_budget) > 0) {
        budgetType = 'CBO (Daily)';
        budgetValue = parseFloat(c.daily_budget) / 100; // Meta budgets are returned in cents
      } else if (c.lifetime_budget && parseInt(c.lifetime_budget) > 0) {
        budgetType = 'CBO (Lifetime)';
        budgetValue = parseFloat(c.lifetime_budget) / 100;
      }

      return {
        id: c.id,
        name: c.name,
        status: c.status || 'UNKNOWN',
        objective: c.objective || 'UNKNOWN',
        created_time: c.created_time || '',
        budget_type: budgetType,
        budget_value: budgetValue,
        buying_type: c.buying_type || '',
        spend,
        impressions: parseInt(ins.impressions || 0),
        clicks: parseInt(ins.clicks || 0),
        ctr: parseFloat(ins.ctr || 0),
        cpc: parseFloat(ins.cpc || 0),
        purchases,
        roas: spend > 0 ? purchaseValue / spend : 0,
        cpa: purchases > 0 ? spend / purchases : 0
      };
    });

    // Append archived/historical campaigns
    const campaignsListIds = new Set(campaignsList.map(c => c.id));
    campaignInsights.forEach(ins => {
      if (!campaignsListIds.has(ins.campaign_id)) {
        const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
        const spend = parseFloat(ins.spend || 0);
        campaigns.push({
          id: ins.campaign_id,
          name: ins.campaign_name,
          status: 'ARCHIVED',
          objective: 'UNKNOWN',
          created_time: '',
          budget_type: 'UNKNOWN',
          budget_value: 0,
          buying_type: '',
          spend,
          impressions: parseInt(ins.impressions || 0),
          clicks: parseInt(ins.clicks || 0),
          ctr: parseFloat(ins.ctr || 0),
          cpc: parseFloat(ins.cpc || 0),
          purchases,
          roas: spend > 0 ? purchaseValue / spend : 0,
          cpa: purchases > 0 ? spend / purchases : 0
        });
      }
    });

    // Map adset insights
    const adsetInsightsMap = {};
    adsetInsights.forEach(ins => {
      adsetInsightsMap[ins.adset_id] = ins;
    });

    // 2. Build adsets array
    const adsets = adsetsList.map(a => {
      const ins = adsetInsightsMap[a.id] || {};
      const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
      const spend = parseFloat(ins.spend || 0);
      const targetingParsed = parseTargeting(a.targeting);

      let budgetValue = 0;
      let budgetType = 'ABO';
      if (a.daily_budget && parseInt(a.daily_budget) > 0) {
        budgetValue = parseFloat(a.daily_budget) / 100;
        budgetType = 'Daily';
      } else if (a.lifetime_budget && parseInt(a.lifetime_budget) > 0) {
        budgetValue = parseFloat(a.lifetime_budget) / 100;
        budgetType = 'Lifetime';
      }

      return {
        id: a.id,
        name: a.name,
        status: a.status || 'UNKNOWN',
        campaign_id: a.campaign?.id || '',
        created_time: a.created_time || '',
        budget_value: budgetValue,
        budget_type: budgetType,
        destination_type: a.destination_type || 'UNKNOWN',
        spend,
        impressions: parseInt(ins.impressions || 0),
        clicks: parseInt(ins.clicks || 0),
        ctr: parseFloat(ins.ctr || (ins.clicks > 0 ? (ins.clicks / ins.impressions) * 100 : 0)),
        cpc: parseFloat(ins.cpc || 0),
        purchases,
        roas: spend > 0 ? purchaseValue / spend : 0,
        cpa: purchases > 0 ? spend / purchases : 0,
        targeting: targetingParsed
      };
    });

    // Summary calculations
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalPurchases = 0;
    let totalPurchaseValue = 0;

    campaignInsights.forEach(c => {
      totalSpend += parseFloat(c.spend || 0);
      totalImpressions += parseInt(c.impressions || 0);
      totalClicks += parseInt(c.clicks || 0);
      
      const { purchases, purchaseValue } = parseActions(c.actions, c.action_values);
      totalPurchases += purchases;
      totalPurchaseValue += purchaseValue;
    });

    const averageCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const averageCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const averageCPA = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
    const averageROAS = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

    // Map ad insights
    const adInsightsMap = {};
    adInsights.forEach(ins => {
      adInsightsMap[ins.ad_id] = ins;
    });

    // Helper to extract best creative preview image or video
    const extractCreativeMedia = (creative = {}, storyIdDataMap = {}) => {
      let imageUrl = '';
      let videoUrl = '';

      if (creative.image_url) {
        imageUrl = creative.image_url;
      } else if (creative.thumbnail_url) {
        imageUrl = creative.thumbnail_url;
      }

      // 1. Fallback for story ID (image or video thumbnail)
      if (creative.effective_object_story_id && storyIdDataMap[creative.effective_object_story_id]) {
        const postData = storyIdDataMap[creative.effective_object_story_id];
        if (postData.full_picture) {
          imageUrl = postData.full_picture;
        } else if (postData.picture) {
          imageUrl = postData.picture;
        }
        
        if (!imageUrl && postData.attachments && postData.attachments.data && postData.attachments.data.length > 0) {
          const mainAtt = postData.attachments.data[0];
          if (mainAtt.media && mainAtt.media.image) {
            imageUrl = mainAtt.media.image.src;
          } else if (mainAtt.subattachments && mainAtt.subattachments.data && mainAtt.subattachments.data.length > 0) {
            const firstSub = mainAtt.subattachments.data[0];
            if (firstSub.media && firstSub.media.image) {
              imageUrl = firstSub.media.image.src;
            }
          }
        }
      }

      // 2. Fallback for video ID (video source URL and picture thumbnail)
      if (creative.video_id && storyIdDataMap[creative.video_id]) {
        const videoData = storyIdDataMap[creative.video_id];
        if (videoData.source) {
          videoUrl = videoData.source;
        }
        if (!imageUrl && videoData.picture) {
          imageUrl = videoData.picture;
        }
      }

      // 3. Fallback to object_story_spec if still empty
      if (!imageUrl && creative.object_story_spec) {
        const spec = creative.object_story_spec;
        if (spec.link_data) {
          const link = spec.link_data;
          if (link.picture) {
            imageUrl = link.picture;
          } else if (link.child_attachments && Array.isArray(link.child_attachments) && link.child_attachments.length > 0) {
            imageUrl = link.child_attachments[0].picture || '';
          }
        } else if (spec.video_data) {
          const vid = spec.video_data;
          imageUrl = vid.image_url || vid.thumbnail_url || '';
        } else if (spec.photo_data) {
          const photo = spec.photo_data;
          imageUrl = photo.image_url || '';
        }
      }

      if (!imageUrl && creative.asset_feed_spec) {
        const feed = creative.asset_feed_spec;
        if (feed.images && Array.isArray(feed.images) && feed.images.length > 0) {
          imageUrl = feed.images[0].url || '';
        } else if (feed.videos && Array.isArray(feed.videos) && feed.videos.length > 0) {
          imageUrl = feed.videos[0].thumbnail_url || '';
        }
      }

      if (!imageUrl && creative.video_data) {
        imageUrl = creative.video_data.image_url || creative.video_data.thumbnail_url || '';
      }

      if (creative.video_data_hover_url) {
        videoUrl = creative.video_data_hover_url;
      }

      return { imageUrl, videoUrl };
    };

    // 3. Build ads list
    const processedAds = adListings.map((ad, index) => {
      const creative = ad.creative || {};
      const ins = adInsightsMap[ad.id] || {};
      const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
      const spend = parseFloat(ins.spend || 0);
      const roas = spend > 0 ? purchaseValue / spend : 0;
      const cpa = purchases > 0 ? spend / purchases : 0;
      const ctr = parseFloat(ins.ctr || (ins.clicks > 0 ? (ins.clicks / ins.impressions) * 100 : 0));

      let statusTag = '⚡ Normal';
      if (purchases > 3 && roas > 2.5) {
        statusTag = '🔥 Top Performer';
      } else if (spend > 30 && purchases === 0) {
        statusTag = '⚠️ Underperforming';
      } else if (ctr > 2.0 && cpa < 15) {
        statusTag = '📈 High Potential';
      }

      const media = extractCreativeMedia(creative, storyIdDataMap);

      return {
        id: index + 1,
        ad_id: ad.id,
        name: ad.name,
        campaign_id: ad.campaign?.id || ins.campaign_id || '',
        campaign_name: ad.campaign?.name || ins.campaign_name || '',
        adset_id: ad.adset?.id || ins.adset_id || '',
        adset_name: ad.adset?.name || '',
        spend,
        impressions: parseInt(ins.impressions || 0),
        clicks: parseInt(ins.clicks || 0),
        ctr,
        cpc: parseFloat(ins.cpc || 0),
        purchases,
        purchaseValue,
        roas,
        cpa,
        statusTag,
        status: ad.status || ad.effective_status || 'UNKNOWN',
        title: creative.title || '',
        body: creative.body || '',
        image_url: media.imageUrl,
        video_url: media.videoUrl
      };
    });

    // Append archived ads
    const adListingsIds = new Set(adListings.map(ad => ad.id));
    adInsights.forEach(ins => {
      if (!adListingsIds.has(ins.ad_id)) {
        const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
        const spend = parseFloat(ins.spend || 0);
        const roas = spend > 0 ? purchaseValue / spend : 0;
        const cpa = purchases > 0 ? spend / purchases : 0;
        const ctr = parseFloat(ins.ctr || 0);

        let statusTag = '⚡ Normal';
        if (purchases > 3 && roas > 2.5) {
          statusTag = '🔥 Top Performer';
        } else if (spend > 30 && purchases === 0) {
          statusTag = '⚠️ Underperforming';
        } else if (ctr > 2.0 && cpa < 15) {
          statusTag = '📈 High Potential';
        }

        processedAds.push({
          id: processedAds.length + 1,
          ad_id: ins.ad_id,
          name: ins.ad_name,
          campaign_id: ins.campaign_id || '',
          campaign_name: ins.campaign_name || '',
          adset_id: ins.adset_id || '',
          adset_name: '',
          spend,
          impressions: parseInt(ins.impressions || 0),
          clicks: parseInt(ins.clicks || 0),
          ctr,
          cpc: parseFloat(ins.cpc || 0),
          purchases,
          purchaseValue,
          roas,
          cpa,
          statusTag,
          status: 'ARCHIVED',
          title: '',
          body: '',
          image_url: '',
          video_url: ''
        });
      }
    });

    processedAds.sort((a, b) => b.spend - a.spend);

    const reports = {
      summary: {
        spend: totalSpend,
        impressions: totalImpressions,
        clicks: totalClicks,
        purchases: totalPurchases,
        revenue: totalPurchaseValue,
        ctr: averageCTR,
        cpc: averageCPC,
        cpa: averageCPA,
        roas: averageROAS
      },
      campaigns,
      adsets,
      ads: processedAds,
      debug_creatives: adListings.map(ad => ({
        id: ad.id,
        name: ad.name,
        creative: ad.creative
      }))
    };

    return NextResponse.json(reports);
  } catch (error) {
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
