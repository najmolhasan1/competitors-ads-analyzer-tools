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
    const campaignsListUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/campaigns?fields=id,name,status,objective,created_time,daily_budget,lifetime_budget,buying_type&limit=150&access_token=${metaToken}`;

    // 2. Fetch campaign insights
    const campaignsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=campaign_id,spend,impressions,clicks,cpc,ctr,actions,action_values&${dateParam}&level=campaign&limit=100&access_token=${metaToken}`;
    
    // 3. Fetch adsets details (including targeting and budgets)
    const adsetsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/adsets?fields=id,name,status,campaign{id},created_time,daily_budget,lifetime_budget,targeting,destination_type&limit=150&access_token=${metaToken}`;

    // 4. Fetch adset insights
    const adsetsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=adset_id,spend,impressions,clicks,cpc,ctr,actions,action_values&${dateParam}&level=adset&limit=150&access_token=${metaToken}`;

    // 5. Fetch ad insights
    const adsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=ad_id,ad_name,campaign_id,campaign_name,adset_id,spend,impressions,clicks,cpc,ctr,actions,action_values&${dateParam}&level=ad&limit=150&access_token=${metaToken}`;

    // 6. Fetch ads creatives
    const adsListingUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/ads?fields=id,name,status,effective_status,campaign{id,name},adset{id,name},creative{id,title,body,image_url,thumbnail_url,video_data_hover_url}&limit=150&access_token=${metaToken}`;

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

    const campaignsList = campaignsListData.data || [];
    const campaignInsights = campaignsInsightsData.data || [];
    const adsetsList = adsetsListData.data || [];
    const adsetInsights = adsetsInsightsData.data || [];
    const adInsights = adsInsightsData.data || [];
    const adListings = adsListingData.data || [];

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
        image_url: creative.image_url || creative.thumbnail_url || '',
        video_url: creative.video_data_hover_url || ''
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
      ads: processedAds
    };

    return NextResponse.json(reports);
  } catch (error) {
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
