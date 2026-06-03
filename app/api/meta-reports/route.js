import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { metaToken, metaAccountId, datePreset = 'last_30d' } = await request.json();

    if (!metaToken || !metaAccountId) {
      return NextResponse.json({ error: 'Meta Token and Ad Account ID are required' }, { status: 400 });
    }

    // Clean account ID (ensure it starts with act_)
    const cleanAccountId = metaAccountId.trim().startsWith('act_') 
      ? metaAccountId.trim() 
      : `act_${metaAccountId.trim()}`;

    // 1. Fetch ALL Campaigns in Account (regardless of spend)
    const campaignsListUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/campaigns?fields=id,name,status&limit=150&access_token=${metaToken}`;

    // 2. Fetch Campaign Insights (to get spend metrics)
    const campaignsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr,actions,action_values&date_preset=${datePreset}&level=campaign&limit=100&access_token=${metaToken}`;
    
    // 3. Fetch Ad Level Insights (to match with creatives)
    const adsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr,actions,action_values&date_preset=${datePreset}&level=ad&limit=150&access_token=${metaToken}`;

    // 4. Fetch Ads listing (creative content, status, and associated campaign)
    const adsListingUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/ads?fields=id,name,status,effective_status,campaign{id,name},creative{id,title,body,image_url,thumbnail_url,video_data_hover_url}&limit=150&access_token=${metaToken}`;

    const [campListRes, campInsRes, adsInsRes, adsListRes] = await Promise.all([
      fetch(campaignsListUrl),
      fetch(campaignsInsightsUrl),
      fetch(adsInsightsUrl),
      fetch(adsListingUrl)
    ]);

    // Handle initial errors
    if (!campInsRes.ok) {
      const err = await campInsRes.json();
      return NextResponse.json({ error: `Meta API Error (Campaign Insights): ${err.error?.message || campInsRes.statusText}` }, { status: campInsRes.status });
    }

    const campaignsListData = campListRes.ok ? await campListRes.json() : { data: [] };
    const campaignsInsightsData = await campInsRes.json();
    const adsInsightsData = adsInsRes.ok ? await adsInsRes.json() : { data: [] };
    const adsListingData = adsListRes.ok ? await adsListRes.json() : { data: [] };

    const campaignsList = campaignsListData.data || [];
    const campaignInsights = campaignsInsightsData.data || [];
    const adInsights = adsInsightsData.data || [];
    const adListings = adsListingData.data || [];

    // Parse actions / conversions helper
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

    // Build map of campaign insights by campaign ID
    const campInsightsMap = {};
    campaignInsights.forEach(c => {
      campInsightsMap[c.campaign_id] = c;
    });

    // 1. Build Final Campaigns list (combine full list with insights)
    const campaigns = campaignsList.map(c => {
      const ins = campInsightsMap[c.id] || {};
      const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
      const spend = parseFloat(ins.spend || 0);
      return {
        id: c.id,
        name: c.name,
        status: c.status || 'UNKNOWN',
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

    // Append historical campaigns that had spend but aren't in the active campaigns list
    const campaignsListIds = new Set(campaignsList.map(c => c.id));
    campaignInsights.forEach(ins => {
      if (!campaignsListIds.has(ins.campaign_id)) {
        const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
        const spend = parseFloat(ins.spend || 0);
        campaigns.push({
          id: ins.campaign_id,
          name: ins.campaign_name,
          status: 'ARCHIVED',
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

    // Summary KPIs Calculations
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

    // Build map of ad insights by ad_id
    const adInsightsMap = {};
    adInsights.forEach(ins => {
      adInsightsMap[ins.ad_id] = ins;
    });

    // 2. Build Final Ads List (combine listing with insights)
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

    // Append historical/deleted ads that had spend but aren't in the active listings
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

    // Sort processed ads by spend descending
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
      ads: processedAds
    };

    return NextResponse.json(reports);
  } catch (error) {
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
