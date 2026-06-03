import { NextResponse } from 'next/server';

export async function POST(request) {
  const apiKey = process.env.SEARCHAPI_KEY;
  if (!apiKey) return NextResponse.json({ error: 'SEARCHAPI_KEY নেই' }, { status: 500 });

  try {
    const { company, country, maxAds } = await request.json();
    const params = new URLSearchParams({ engine: 'meta_ad_library', q: company, ad_type: 'all', api_key: apiKey });
    if (country && country !== 'ALL') params.append('country', country);

    const response = await fetch(`https://www.searchapi.io/api/v1/search?${params}`);
    if (!response.ok) {
      const t = await response.text();
      return NextResponse.json({ error: `SearchAPI ${response.status}: ${t.substring(0, 200)}` }, { status: 502 });
    }

    const data = await response.json();
    let rawAds = data.ads || data.organic_results || data.results || [];

    // Accuracy Fix: Drop fake pages by grouping & scoring
    const nameMatchedAds = rawAds.filter(ad => {
      const pName = ad.page_name || (ad.snapshot && ad.snapshot.page_name) || '';
      return pName.toLowerCase().includes(company.toLowerCase());
    });

    if (nameMatchedAds.length > 0) {
      const pageGroups = {};
      nameMatchedAds.forEach(ad => {
        const pName = ad.page_name || (ad.snapshot && ad.snapshot.page_name) || 'Unknown';
        if (!pageGroups[pName]) pageGroups[pName] = [];
        pageGroups[pName].push(ad);
      });

      let bestPage = '';
      let maxScore = -1;
      for (const [pName, adsArr] of Object.entries(pageGroups)) {
        let score = adsArr.length;
        if (pName.toLowerCase() === company.toLowerCase()) score += 1000;
        if (score > maxScore) { maxScore = score; bestPage = pName; }
      }
      rawAds = pageGroups[bestPage];
    }

    const toStr = (val) => {
      if (!val) return '';
      if (Array.isArray(val)) return val.filter(Boolean).map(v => typeof v === 'string' ? v : '').filter(Boolean).join(' | ');
      if (typeof val === 'object') return '';
      return String(val).replace(/[\u0000-\u001F]/g, ' ').trim();
    };
    const toArr = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val.filter(Boolean);
      if (typeof val === 'string' && val) return [val];
      return [];
    };
    const getImgUrl = (img) => {
      if (!img) return '';
      if (typeof img === 'string') return img;
      return img.original_image_url || img.resized_image_url || img.url || img.src || '';
    };
    const getVidUrl = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      return v.video_hd_url || v.video_sd_url || v.url || v.src || '';
    };

    // Sort newest to oldest
    rawAds.sort((a, b) => {
      const dateA = new Date(a.start_date || a.ad_delivery_start_time || 0).getTime() || 0;
      const dateB = new Date(b.start_date || b.ad_delivery_start_time || 0).getTime() || 0;
      return dateB - dateA;
    });

    const normalized = rawAds.slice(0, maxAds || 30).map((ad, i) => {
      const snap = ad.snapshot || {};
      const body = toStr(snap.body?.text || snap.body || snap.extra_texts?.[0] || '');
      const title = toStr(snap.title || snap.caption || '');
      const cta = toStr(snap.cta_text || snap.cta_type || ad.cta_type || '');
      const platform = toStr(ad.publisher_platform || ad.publisher_platforms || '');
      const start_date = toStr(ad.start_date || ad.ad_delivery_start_time || '');
      const end_date = toStr(ad.end_date || '');
      const images = toArr(snap.images || []).map(getImgUrl).filter(Boolean).slice(0, 3);
      const extraImages = toArr(snap.extra_images || []).map(getImgUrl).filter(Boolean).slice(0, 2);
      const allImages = [...new Set([...images, ...extraImages])].slice(0, 4);
      const videos = toArr(snap.videos || snap.extra_videos || []).map(getVidUrl).filter(Boolean).slice(0, 2);
      const format = toStr(snap.display_format || (videos.length ? 'video' : allImages.length ? 'image' : 'unknown'));
      const thumbnail = allImages[0] || '';
      const linkUrl = toStr(snap.link_url || snap.page_profile_uri || '');
      const libraryUrl = ad.ad_archive_id ? `https://www.facebook.com/ads/library/?id=${ad.ad_archive_id}` : '';
      const cards = toArr(snap.cards || []).map(card => ({
        title: toStr(card.title || ''),
        body: toStr(card.body || card.description || ''),
        image: getImgUrl(toArr(card.images || [])[0] || ''),
        cta: toStr(card.cta_text || card.cta_type || ''),
        link: toStr(card.link_url || ''),
      })).filter(c => c.title || c.body || c.image);

      return {
        id: i + 1,
        ad_archive_id: toStr(ad.ad_archive_id || ''),
        page_name: toStr(ad.page_name || snap.page_name || ''),
        title, body, cta, platform, start_date, end_date, format,
        images: allImages, videos, thumbnail, library_url: libraryUrl, link_url: linkUrl, cards,
        status: ad.is_active ? 'active' : 'inactive',
        impressions: toStr(ad.impressions_with_index || ''),
      };
    });

    return NextResponse.json({ ads: normalized, total: normalized.length });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
