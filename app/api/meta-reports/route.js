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

    // 1. Fetch Campaign Insights
    const campaignsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr,actions,action_values&date_preset=${datePreset}&level=campaign&limit=100&access_token=${metaToken}`;
    
    // 2. Fetch Ad Level Insights (to match with creatives)
    const adsInsightsUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/insights?fields=ad_id,ad_name,campaign_id,campaign_name,spend,impressions,clicks,cpc,ctr,actions,action_values&date_preset=${datePreset}&level=ad&limit=150&access_token=${metaToken}`;

    // 3. Fetch Ads listing (creative content & status)
    const adsListingUrl = `https://graph.facebook.com/v19.0/${cleanAccountId}/ads?fields=id,name,status,effective_status,creative{id,title,body,image_url,thumbnail_url,video_data_hover_url}&limit=100&access_token=${metaToken}`;

    const [campRes, adsInsRes, adsListRes] = await Promise.all([
      fetch(campaignsUrl),
      fetch(adsInsightsUrl),
      fetch(adsListingUrl)
    ]);

    // Handle initial errors
    if (!campRes.ok) {
      const err = await campRes.json();
      return NextResponse.json({ error: `Meta API Error (Insights): ${err.error?.message || campRes.statusText}` }, { status: campRes.status });
    }

    const campaignsData = await campRes.json();
    const adsInsightsData = adsInsRes.ok ? await adsInsRes.json() : { data: [] };
    const adsListingData = adsListRes.ok ? await adsListRes.json() : { data: [] };

    const campaigns = campaignsData.data || [];
    const adInsights = adsInsightsData.data || [];
    const adListings = adsListingData.data || [];

    // Summary KPIs Calculations
    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalPurchases = 0;
    let totalPurchaseValue = 0;

    const parseActions = (actions = [], actionValues = []) => {
      let purchases = 0;
      let purchaseValue = 0;

      actions.forEach(act => {
        // Facebook purchase action keys
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

    campaigns.forEach(c => {
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

    // Build map of ad listings (for easy lookup of creative details)
    const adDetailsMap = {};
    adListings.forEach(ad => {
      const creative = ad.creative || {};
      adDetailsMap[ad.id] = {
        name: ad.name,
        status: ad.status || ad.effective_status || 'UNKNOWN',
        title: creative.title || '',
        body: creative.body || '',
        image_url: creative.image_url || creative.thumbnail_url || '',
        video_url: creative.video_data_hover_url || ''
      };
    });

    // Merge ad insights with creative details
    const processedAds = adInsights.map((ins, index) => {
      const details = adDetailsMap[ins.ad_id] || {};
      const { purchases, purchaseValue } = parseActions(ins.actions, ins.action_values);
      const spend = parseFloat(ins.spend || 0);
      const roas = spend > 0 ? purchaseValue / spend : 0;
      const cpa = purchases > 0 ? spend / purchases : 0;
      const ctr = parseFloat(ins.ctr || 0);

      // Simple performance heuristic
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
        status: details.status || 'UNKNOWN',
        title: details.title || '',
        body: details.body || '',
        image_url: details.image_url || '',
        video_url: details.video_url || ''
      };
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
      campaigns: campaigns.map(c => {
        const { purchases, purchaseValue } = parseActions(c.actions, c.action_values);
        const spend = parseFloat(c.spend || 0);
        return {
          id: c.campaign_id || '',
          name: c.campaign_name,
          spend,
          impressions: parseInt(c.impressions || 0),
          clicks: parseInt(c.clicks || 0),
          ctr: parseFloat(c.ctr || 0),
          cpc: parseFloat(c.cpc || 0),
          purchases,
          roas: spend > 0 ? purchaseValue / spend : 0,
          cpa: purchases > 0 ? spend / purchases : 0
        };
      }),
      ads: processedAds
    };

    return NextResponse.json(reports);
  } catch (error) {
    return NextResponse.json({ error: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
