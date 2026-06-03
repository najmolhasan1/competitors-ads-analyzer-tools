'use client';
import { useEffect } from 'react';

export default function Home() {
  useEffect(() => {
    // Wait for Chart.js and html2pdf to load via CDN scripts
    const init = () => {
      var keys = { c: '', s: '' };
      var allAds = [];
      var TODAY = new Date();
      var el = document.getElementById('today-date');
      if (el) el.textContent = TODAY.toLocaleDateString('bn-BD');

      // ---- KEY MANAGEMENT ----
      function openModal() { document.getElementById('modal').classList.add('open'); }
      function closeModal() { document.getElementById('modal').classList.remove('open'); }
      function saveKeys() {
        var c = document.getElementById('ckey').value.trim();
        var s = document.getElementById('skey').value.trim();
        if (!c || !s) { alert('দুটো key-ই দিতে হবে।'); return; }
        keys.c = c; keys.s = s;
        try { localStorage.setItem('mai_c', c); localStorage.setItem('mai_s', s); } catch (e) { }
        updateKeyUI(true);
        closeModal();
      }
      function updateKeyUI(ok) {
        document.getElementById('key-dot').style.background = ok ? 'var(--green)' : 'var(--red)';
        document.getElementById('key-label').textContent = ok ? 'Keys সেট আছে' : 'API Keys সেট করো';
      }

      // Load saved keys & last search
      try {
        var c = localStorage.getItem('mai_c'), s = localStorage.getItem('mai_s');
        if (c && s) { keys.c = c; keys.s = s; document.getElementById('ckey').value = c; document.getElementById('skey').value = s; updateKeyUI(true); }
        var savedSearch = localStorage.getItem('mai_saved_search');
        if (savedSearch) {
          var sd = JSON.parse(savedSearch);
          document.getElementById('company').value = sd.company;
          document.getElementById('country').value = sd.country;
          document.getElementById('hero-section').style.display = 'none';
          allAds = sd.ads;
          renderDashboard(sd.company, sd.country, sd.ads, sd.analysis);
        }
      } catch (e) { }

      document.getElementById('company').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });

      // Expose global functions (needed for inline onclick handlers)
      window.openModal = openModal;
      window.closeModal = closeModal;
      window.saveKeys = saveKeys;

      // ---- UTILITIES ----
      function esc(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }
      function daysDiff(dateStr) {
        if (!dateStr) return null;
        try { var d = new Date(dateStr); if (isNaN(d)) return null; return Math.floor((TODAY - d) / (1000 * 60 * 60 * 24)); } catch (e) { return null; }
      }
      function durLabel(days) {
        if (days === null) return { text: 'অজানা', cls: '' };
        if (days <= 7) return { text: days + 'দিন (নতুন)', cls: 'dur-new' };
        if (days <= 30) return { text: days + 'দিন', cls: 'dur-mid' };
        return { text: days + 'দিন (দীর্ঘ)', cls: 'dur-long' };
      }
      function durBarClass(days) {
        if (!days) return 'bar-short';
        if (days <= 14) return 'bar-short';
        if (days <= 30) return 'bar-medium';
        if (days <= 90) return 'bar-long';
        return 'bar-very-long';
      }

      // ---- UI HELPERS ----
      function showErr(msg) {
        var el = document.getElementById('errbox');
        el.textContent = msg; el.style.display = 'block';
        document.getElementById('loading').style.display = 'none';
        document.getElementById('go-btn').disabled = false;
      }
      function setLoad(t, s) {
        document.getElementById('ltxt').textContent = t;
        document.getElementById('lsub').textContent = s || '';
        document.getElementById('loading').style.display = 'block';
        document.getElementById('errbox').style.display = 'none';
      }
      function openNavMenu() {
        document.getElementById('nav-flyout').classList.add('open');
        document.getElementById('nav-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';
      }
      function closeNavMenu() {
        document.getElementById('nav-flyout').classList.remove('open');
        document.getElementById('nav-overlay').classList.remove('open');
        document.body.style.overflow = '';
      }
      function navTo(id) {
        closeNavMenu();
        setTimeout(function () {
          var el = document.getElementById(id);
          if (el) {
            var topbarH = document.querySelector('.topbar') ? document.querySelector('.topbar').offsetHeight : 60;
            var elTop = el.getBoundingClientRect().top + window.pageYOffset - topbarH - 16;
            window.scrollTo({ top: elTop, behavior: 'smooth' });
          }
        }, 380);
      }
      function resetAll() {
        document.body.classList.remove('dashboard-open');
        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('hero-section').style.display = 'block';
        document.getElementById('errbox').style.display = 'none';
        document.getElementById('company').value = '';
        document.getElementById('go-btn').disabled = false;
        allAds = [];
        try { localStorage.removeItem('mai_saved_search'); } catch (e) { }
      }

      // Expose nav functions globally
      window.openNavMenu = openNavMenu;
      window.closeNavMenu = closeNavMenu;
      window.navTo = navTo;
      window.resetAll = resetAll;
      window.scrollToSection = navTo;

      // ---- MAIN FLOW ----
      async function go() {
        var company = document.getElementById('company').value.trim();
        var country = document.getElementById('country').value;
        var maxAds = parseInt(document.getElementById('maxads').value);
        if (!company) { alert('কোম্পানির নাম লেখো।'); return; }
        if (!keys.c || !keys.s) { openModal(); return; }

        document.getElementById('dashboard').style.display = 'none';
        document.getElementById('hero-section').style.display = 'none';
        document.getElementById('errbox').style.display = 'none';
        document.getElementById('go-btn').disabled = true;
        setLoad('অ্যাড লাইব্রেরি থেকে ডেটা কালেক্ট করা হচ্ছে...', '"' + company + '" এর রানিং অ্যাডসগুলো খোঁজা হচ্ছে');

        try {
          var r1 = await fetch('/api/fetch-ads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company, country, maxAds }) });
          var d1; try { d1 = await r1.json(); } catch (e) { throw new Error('Server invalid response'); }
          if (!r1.ok) throw new Error(d1.error || 'Ads fetch failed');
          if (!d1.ads || d1.ads.length === 0) throw new Error('"' + company + '" এর কোনো অ্যাকটিভ অ্যাড পাওয়া যায়নি। নাম বা দেশ বদলে আবার চেষ্টা করুন।');

          allAds = d1.ads;
          setLoad('এআই ডেটা অ্যানালাইজ করছে...', allAds.length + ' টি অ্যাড প্রসেস করতে একটু সময় লাগতে পারে');

          var analysis = await analyzeWithClaude(company, country, allAds);
          renderDashboard(company, country, allAds, analysis);
          try { localStorage.setItem('mai_saved_search', JSON.stringify({ company, country, ads: allAds, analysis })); } catch (e) { }
        } catch (err) {
          document.getElementById('hero-section').style.display = 'block';
          showErr('সমস্যা হয়েছে: ' + err.message);
        }
      }
      window.go = go;

      // ---- CLAUDE ANALYSIS ----
      async function analyzeWithClaude(company, country, ads) {
        var todayStr = TODAY.toISOString().split('T')[0];
        var adSummaries = ads.map(function (ad, i) {
          var days = daysDiff(ad.start_date);
          var body = (ad.body || '').replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim().substring(0, 300);
          var title = (ad.title || '').replace(/"/g, "'").trim().substring(0, 100);
          return { id: i + 1, title, body, cta: (ad.cta || '').trim(), platform: (ad.platform || '').trim(), format: (ad.format || '').trim(), start_date: (ad.start_date || '').substring(0, 10), days_running: days !== null ? days : -1, has_image: !!(ad.images && ad.images.length), has_video: !!(ad.videos && ad.videos.length) };
        });

        var messages = [{ role: 'user', content: 'You are an expert Meta Ads strategist for South Asian markets. Today is ' + todayStr + '.\n\nAnalyze these ' + ads.length + ' ads from "' + company + '" (Country: ' + country + ').\n\nAD DATA (JSON):\n' + JSON.stringify(adSummaries) + '\n\nReturn a JSON analysis. All Bangla text fields must use simple Bangla sentences without special quote characters. Use only standard double quotes for JSON strings.\n\nRequired format:\n{"cta_analysis":{"items":[{"cta":"ORDER_NOW","count":5,"ad_ids":[1,2,3],"insight":"insight text"}],"ai_insight":"insight"},"body_analysis":{"ad_classifications":[{"ad_id":1,"primary_type":"Offer"}],"elements":{"has_phone":false,"has_website":false,"has_cta_in_text":false,"formula_used":"PAS"},"approach_breakdown":"text","ai_insight":"text"},"heading_analysis":{"ai_insight":"text"},"creative_analysis":{"ad_classifications":[{"ad_id":1,"creative_type":"feature_highlight"}],"format_breakdown":{"image":0,"video":0,"carousel":0},"ai_insight":"text"},"platform_analysis":{"platforms":[{"name":"Facebook","percentage":80}],"ai_insight":"text"},"marketing_approach":{"primary_strategy":"text","messaging_focus":"text","audience_signals":"text","testing_signals":"text","overall_assessment":"text"},"recommendations":[{"title":"title","description":"desc","priority":"high"}]}\n\nRules: ad_ids use actual ad id numbers. For body_analysis.ad_classifications, assign exactly ONE primary_type (must be exactly one of: USP, FOMO, Offer, Feature, Price, Story, Social Proof, Problem-Solution) for each ad based on deep body text analysis. For creative_analysis.ad_classifications, assign exactly pattern (must be: feature_highlight, problem_solution, influencer, ugc, review, usp, offer). All text in Bangla. No line breaks inside string values. priority = high/medium/low only.' }];

        var r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': keys.c, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, messages })
        });
        if (!r.ok) { var e; try { e = await r.json(); } catch (x) { throw new Error('Claude API error: ' + r.status); } throw new Error((e.error && e.error.message) || 'Claude API error'); }

        var d = await r.json();
        var raw = d.content && d.content.map(function (c) { return c.text || ''; }).join('') || '';
        var js = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
        var start = js.indexOf('{'); var end = js.lastIndexOf('}');
        if (start === -1 || end === -1) throw new Error('Claude valid JSON দেয়নি। আবার চেষ্টা করো।');
        js = js.substring(start, end + 1).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

        var parseAndTransform = function (jsonStr) {
          var p = JSON.parse(jsonStr);
          if (p.body_analysis && p.body_analysis.ad_classifications) {
            p.body_analysis.type_breakdown = {};
            p.body_analysis.body_type_ad_ids = {};
            var validBodyTypes = ['USP', 'FOMO', 'Offer', 'Feature', 'Price', 'Story', 'Social Proof', 'Problem-Solution'];
            validBodyTypes.forEach(function (t) { p.body_analysis.type_breakdown[t] = 0; p.body_analysis.body_type_ad_ids[t] = []; });
            p.body_analysis.ad_classifications.forEach(function (c) {
              var t = c.primary_type;
              if (validBodyTypes.indexOf(t) !== -1) { p.body_analysis.type_breakdown[t]++; p.body_analysis.body_type_ad_ids[t].push(c.ad_id); }
            });
          }
          if (p.creative_analysis && p.creative_analysis.ad_classifications) {
            p.creative_analysis.creative_types = {};
            p.creative_analysis.creative_type_ad_ids = {};
            var validCTypes = ['feature_highlight', 'problem_solution', 'influencer', 'ugc', 'review', 'usp', 'offer'];
            validCTypes.forEach(function (t) { p.creative_analysis.creative_types[t] = 0; p.creative_analysis.creative_type_ad_ids[t] = []; });
            p.creative_analysis.ad_classifications.forEach(function (c) {
              var t = c.creative_type;
              if (validCTypes.indexOf(t) !== -1) { p.creative_analysis.creative_types[t]++; p.creative_analysis.creative_type_ad_ids[t].push(c.ad_id); }
            });
          }
          return p;
        };

        try { return parseAndTransform(js); } catch (e) {
          try { js = js.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'); return parseAndTransform(js); }
          catch (e2) { throw new Error('JSON parse error: ' + e2.message + ' — আবার চেষ্টা করো'); }
        }
      }

      // ---- RENDER DASHBOARD ----
      function renderDashboard(company, country, ads, r) {
        document.body.classList.add('dashboard-open');
        document.getElementById('loading').style.display = 'none';
        document.getElementById('go-btn').disabled = false;
        document.getElementById('dash-company').textContent = company + ' — Ad Intelligence';
        document.getElementById('dash-meta').textContent = ads.length + ' টি ad বিশ্লেষণ করা হয়েছে · ' + country + ' মার্কেট · ' + TODAY.toLocaleDateString('bn-BD');

        var videoCount = ads.filter(function (a) { return (a.format || '').toLowerCase().includes('video'); }).length;
        var imageCount = ads.filter(function (a) { return (a.format || '').toLowerCase().includes('image'); }).length;
        var allDays = ads.map(function (a) { return daysDiff(a.start_date); }).filter(function (d) { return d !== null; });
        var maxDaysAd = Math.max.apply(null, allDays.length ? allDays : [0]);
        var uniqueBodies = Object.keys(ads.reduce(function (acc, a) { if (a.body) acc[a.body.trim()] = 1; return acc; }, {})).length;

        document.getElementById('stat-row').innerHTML = [
          ['মোট Ads', ads.length, 'বিশ্লেষণ করা হয়েছে'],
          ['Video Ads', videoCount, ads.length ? Math.round(videoCount / ads.length * 100) + '% মোটের' : ''],
          ['Image Ads', imageCount, ads.length ? Math.round(imageCount / ads.length * 100) + '% মোটের' : ''],
          ['Unique Creatives', uniqueBodies, 'আলাদা body text'],
          ['সবচেয়ে পুরনো', maxDaysAd + 'দিন', 'সবচেয়ে দীর্ঘ active ad'],
        ].map(function (x) { return '<div class="stat"><div class="stat-label">' + x[0] + '</div><div class="stat-value">' + x[1] + '</div><div class="stat-sub">' + x[2] + '</div></div>'; }).join('');

        renderCTA(ads, r.cta_analysis);
        renderHeadings(ads, r.heading_analysis);
        renderBodyAnalysis(ads, r.body_analysis);
        renderCreative(ads, r.creative_analysis);
        renderPlatform(ads, r.platform_analysis);
        renderTimeline(ads);
        renderApproach(r.marketing_approach);
        renderRecommendations(r.recommendations);
        renderAdsGrouped(ads);

        document.getElementById('dashboard').style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }

      // ---- CTA ----
      function renderCTA(ads, data) {
        var ctas = {};
        ads.forEach(function (ad) { var c = (ad.cta || '').trim(); if (c) { ctas[c] = (ctas[c] || 0) + 1; } });
        var sorted = Object.keys(ctas).sort(function (a, b) { return ctas[b] - ctas[a]; });
        var chartHtml = '<div style="height:220px;width:100%;margin-bottom:20px;position:relative"><canvas id="ctaChart"></canvas></div>';
        var html = '';
        if (data && data.ai_insight) html += '<div class="ai-insight"><div class="ai-insight-label">AI Insight</div><div class="ai-insight-text">' + esc(data.ai_insight) + '</div></div>';
        if (sorted.length === 0) { html += '<p style="color:var(--text3);font-size:13px;padding:12px 0">কোনো Call to Action বাটন পাওয়া যায়নি</p>'; document.getElementById('cta-content').innerHTML = html; return; }
        window._drawerData = window._drawerData || {};
        var manualData = (data && data.cta_breakdown) ? data.cta_breakdown : sorted.map(function (k) { return { cta: k, count: ctas[k] }; });
        html += manualData.map(function (item, idx) {
          var pct = Math.round((item.count || ctas[item.cta] || 1) / ads.length * 100);
          var barW = pct > 100 ? 100 : pct;
          var adIds = item.ad_ids || [];
          var ctaVal = item.cta || '';
          if (!adIds.length) { adIds = ads.filter(function (a) { return (a.cta || '').toUpperCase() === ctaVal.toUpperCase(); }).map(function (a) { return a.id; }); }
          var key = 'cta_' + idx;
          window._drawerData[key] = { title: 'CTA: ' + ctaVal, subtitle: item.count + ' ads এ ব্যবহার হয়েছে', ids: adIds };
          return '<div class="cta-item clickable" onclick="showDrawer(\'' + key + '\')" title="Click to see ads"><div class="cta-name">' + esc(ctaVal) + '</div><div class="cta-bar-wrap"><div class="cta-bar-track"><div class="cta-bar-fill" style="width:' + barW + '%"></div></div></div><div class="cta-count">' + item.count + '<span class="cta-pct">' + pct + '%</span></div></div>';
        }).join('') + '<div class="click-hint">↑ যেকোনো row এ click করলে সেই ads দেখাবে</div>';
        document.getElementById('cta-content').innerHTML = chartHtml + html;
        setTimeout(function () {
          var ctx = document.getElementById('ctaChart').getContext('2d');
          if (window.ctaChartInst) window.ctaChartInst.destroy();
          window.ctaChartInst = new Chart(ctx, { type: 'doughnut', data: { labels: sorted, datasets: [{ data: sorted.map(function (c) { return ctas[c]; }), backgroundColor: ['#0866FF', '#31A24C', '#F0A30A', '#E22828', '#8B4DFF', '#333333'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'right', labels: { font: { family: 'inherit', size: 12 }, boxWidth: 12 } } } } });
        }, 50);
      }

      // ---- HEADINGS ----
      function renderHeadings(ads, data) {
        var headings = {};
        ads.forEach(function (ad) { var t = (ad.title || '').trim(); if (t) { headings[t] = (headings[t] || 0) + 1; } });
        var sorted = Object.keys(headings).sort(function (a, b) { return headings[b] - headings[a]; });
        var html = '';
        if (data && data.ai_insight) html += '<div class="ai-insight"><div class="ai-insight-label">AI Insight</div><div class="ai-insight-text">' + esc(data.ai_insight) + '</div></div>';
        if (sorted.length === 0) { html += '<p style="color:var(--text3);font-size:13px;padding:12px 0">কোনো heading পাওয়া যায়নি</p>'; }
        else {
          window._drawerData = window._drawerData || {};
          html += sorted.map(function (h, hidx) {
            var cnt = headings[h];
            var matchIds = ads.filter(function (a) { return (a.title || '').trim() === h; }).map(function (a) { return a.id; });
            var key = 'heading_' + hidx;
            window._drawerData[key] = { title: 'Heading', subtitle: cnt + ' টি ad এ ব্যবহার হয়েছে', ids: matchIds };
            return '<div class="heading-item clickable" onclick="showDrawer(\'' + key + '\')" title="Click to see"><div class="heading-txt">' + esc(h) + '</div><span class="heading-cnt">' + cnt + '/' + ads.length + '</span></div>';
          }).join('') + '<div class="click-hint">↑ যেকোনো heading এ click করলে সেই ads দেখাবে</div>';
        }
        document.getElementById('heading-content').innerHTML = html;
      }

      // ---- BODY ANALYSIS ----
      function renderBodyAnalysis(ads, data) {
        var html = '';
        if (data) {
          var tb = data.type_breakdown || {};
          if (Object.keys(tb).length > 0) {
            var btIds = data.body_type_ad_ids || {};
            window._drawerData = window._drawerData || {};
            html += '<div class="type-breakdown" style="margin-bottom:16px">';
            Object.keys(tb).forEach(function (type, tidx) {
              var adIds = btIds[type] || []; var count = tb[type] || 0; var key = 'bodytype_' + tidx;
              window._drawerData[key] = { title: type + ' Ads', subtitle: count + ' টি ad এ পাওয়া গেছে', ids: adIds };
              html += '<div class="type-block clickable" onclick="showDrawer(\'' + key + '\')" title="Click to see"><div class="type-block-label">' + type + '</div><div class="type-block-val">' + count + '</div><div class="type-block-sub">' + Math.round(count / ads.length * 100) + '% ads এ</div><div class="click-hint">👆 click</div></div>';
            });
            html += '</div>';
          }
          if (data.elements) {
            var el = data.elements;
            html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">';
            html += '<span class="body-el ' + (el.has_phone ? 'has' : 'not') + '">' + (el.has_phone ? '✔' : '✖') + ' Phone Number</span>';
            html += '<span class="body-el ' + (el.has_website ? 'has' : 'not') + '">' + (el.has_website ? '✔' : '✖') + ' Website Link</span>';
            html += '<span class="body-el ' + (el.has_cta_in_text ? 'has' : 'not') + '">' + (el.has_cta_in_text ? '✔' : '✖') + ' CTA in Text</span>';
            if (el.formula_used) html += '<span class="body-el has" style="background:var(--blue);border-color:var(--blue);">Formula: ' + esc(el.formula_used) + '</span>';
            html += '</div>';
          }
          if (data.approach_breakdown) html += '<div class="ai-insight" style="margin-bottom:12px"><div class="ai-insight-label">Approach Breakdown</div><div class="ai-insight-text">' + esc(data.approach_breakdown) + '</div></div>';
          if (data.ai_insight) html += '<div class="ai-insight"><div class="ai-insight-label">AI Insight — কিসে Focus করা উচিৎ</div><div class="ai-insight-text">' + esc(data.ai_insight) + '</div></div>';
        }
        document.getElementById('body-analysis-top').innerHTML = html;
        var bodies = {};
        ads.forEach(function (ad) { var b = (ad.body || '').trim(); if (b) { bodies[b] = (bodies[b] || 0) + 1; } });
        var bodyKeys = Object.keys(bodies).sort(function (a, b) { return bodies[b] - bodies[a]; });
        var listHtml = bodyKeys.map(function (body, i) {
          var cnt = bodies[body]; var preview = body.substring(0, 160); var hasMore = body.length > 160; var bodyId = 'body-full-' + i;
          var hasPhone = /\d{10,}/.test(body) || /01[3-9]\d{8}/.test(body); var hasWeb = /\.com|\.net|www\./i.test(body); var hasCTA = /অর্ডার|কিনুন|ক্লিক|visit|order|click|shop/i.test(body);
          var elHtml = '<div class="body-elements"><span class="body-el ' + (hasPhone ? 'has' : '') + '">📞 Phone</span><span class="body-el ' + (hasWeb ? 'has' : '') + '">🌐 Website</span><span class="body-el ' + (hasCTA ? 'has' : '') + '">👉 CTA</span></div>';
          var expandBtn = hasMore ? '<button class="xbtn" onclick="expandBodyText(\'' + bodyId + '\',this,`' + body.replace(/`/g, "'").replace(/\n/g, '\\n') + '`)">See more ▾</button>' : '';
          return '<div class="body-item"><div class="body-type-tags"></div><div class="body-body-label" style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px">Body Text ' + (i + 1) + (cnt > 1 ? ' <strong style=\'color:var(--accent)\'>(' + cnt + 'x ব্যবহার)</strong>' : '') + '</div><div class="body-preview" id="' + bodyId + '">' + esc(preview) + (hasMore ? '…' : '') + '</div>' + expandBtn + elHtml + '</div>';
        }).join('');
        document.getElementById('body-list').innerHTML = listHtml || '<p style="color:var(--text3);font-size:13px">কোনো body text পাওয়া যায়নি</p>';
      }

      function expandBodyText(id, btn, full) {
        var el = document.getElementById(id);
        if (el) el.textContent = full.replace(/\\n/g, '\n');
        btn.style.display = 'none';
      }
      window.expandBodyText = expandBodyText;

      // ---- CREATIVE ----
      function renderCreative(ads, data) {
        var html = '';
        if (data) {
          var fb = data.format_breakdown || {};
          html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">';
          ['image', 'video', 'carousel'].forEach(function (f) { var cnt = fb[f] || 0; html += '<div class="type-block"><div class="type-block-label">' + f + '</div><div class="type-block-val">' + cnt + '</div><div class="type-block-sub">' + Math.round(cnt / ads.length * 100) + '%</div></div>'; });
          html += '</div>';
          var ct = data.creative_types || {}; var ctIds = data.creative_type_ad_ids || {};
          var ctLabels = { feature_highlight: 'Feature Highlight', problem_solution: 'Problem → Solution', influencer: 'Influencer', ugc: 'UGC', review: 'Review/Testimonial', usp: 'USP', offer: 'Offer/Discount' };
          window._drawerData = window._drawerData || {};
          html += '<div style="margin-bottom:14px">';
          Object.keys(ct).forEach(function (k, cidx) {
            if (!ct[k]) return; var adIds = ctIds[k] || []; var label = ctLabels[k] || k; var key = 'creative_' + cidx;
            window._drawerData[key] = { title: label, subtitle: ct[k] + ' টি ad', ids: adIds };
            html += '<div class="cta-item clickable" onclick="showDrawer(\'' + key + '\')" title="Click to see"><div class="cta-name" style="font-size:12px">' + esc(label) + '</div><div class="cta-bar-wrap"><div class="cta-bar-track"><div class="cta-bar-fill" style="width:' + Math.round(ct[k] / ads.length * 100) + '%"></div></div></div><div class="cta-count" style="font-size:12px">' + ct[k] + '</div></div>';
          });
          html += '</div><div class="click-hint">↑ Click করলে সেই ধরনের ads দেখাবে</div>';
          if (data.ai_insight) html += '<div class="ai-insight"><div class="ai-insight-label">AI Insight</div><div class="ai-insight-text">' + esc(data.ai_insight) + '</div></div>';
        }
        document.getElementById('creative-content').innerHTML = html;
      }

      // ---- PLATFORM ----
      function renderPlatform(ads, data) {
        var platIcons = { Facebook: '📘', Instagram: '📸', Messenger: '💬', Audience_Network: '📱', 'Audience Network': '📱' };
        var html = '<div style="height:220px;width:100%;margin-bottom:20px;position:relative"><canvas id="platChart"></canvas></div>';
        if (data && data.ai_insight) html += '<div class="ai-insight" style="margin-bottom:16px"><div class="ai-insight-label">AI Insight</div><div class="ai-insight-text">' + esc(data.ai_insight) + '</div></div>';
        var platCounts = {};
        ads.forEach(function (ad) { var plats = (ad.platform || '').split(',').map(function (p) { return p.trim(); }).filter(Boolean); if (!plats.length) plats = ['Unknown']; plats.forEach(function (p) { platCounts[p] = (platCounts[p] || 0) + 1; }); });
        var platforms = data && data.platforms && data.platforms.length ? data.platforms : Object.keys(platCounts).map(function (k) { return { name: k, percentage: Math.round(platCounts[k] / ads.length * 100) }; });
        html += '<div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">' + platforms.map(function (p) { return '<div class="platform-item"><div class="platform-icon">' + (platIcons[p.name] || '🌐') + '</div><div class="platform-name">' + esc(p.name) + '</div><div class="platform-pct">' + p.percentage + '%</div></div>'; }).join('') + '</div>';
        document.getElementById('platform-content').innerHTML = html;
        setTimeout(function () {
          var ctx = document.getElementById('platChart').getContext('2d');
          if (window.platChartInst) window.platChartInst.destroy();
          window.platChartInst = new Chart(ctx, { type: 'pie', data: { labels: platforms.map(function (p) { return p.name; }), datasets: [{ data: platforms.map(function (p) { return p.percentage; }), backgroundColor: ['#0866FF', '#E1306C', '#00B2FF', '#31A24C', '#F0A30A'], borderWidth: 0 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { family: 'inherit', size: 12 } } } } } });
        }, 50);
      }

      // ---- TIMELINE ----
      function renderTimeline(ads) {
        var maxD = 0;
        var adsWithDays = ads.map(function (ad) { var d = daysDiff(ad.start_date); if (d !== null && d > maxD) maxD = d; return { ad, days: d }; });
        var byRange = { '১-৭ দিন': 0, '৮-৩০ দিন': 0, '৩১-৯০ দিন': 0, '৯০+ দিন': 0 };
        adsWithDays.forEach(function (x) { if (x.days === null) return; if (x.days <= 7) byRange['১-৭ দিন']++; else if (x.days <= 30) byRange['৮-৩০ দিন']++; else if (x.days <= 90) byRange['৩১-৯০ দিন']++; else byRange['৯০+ দিন']++; });
        var rangeAds = { '১-৭ দিন': ads.filter(function (a) { var d = daysDiff(a.start_date); return d !== null && d <= 7; }).map(function (a) { return a.id; }), '৮-৩০ দিন': ads.filter(function (a) { var d = daysDiff(a.start_date); return d !== null && d > 7 && d <= 30; }).map(function (a) { return a.id; }), '৩১-৯০ দিন': ads.filter(function (a) { var d = daysDiff(a.start_date); return d !== null && d > 30 && d <= 90; }).map(function (a) { return a.id; }), '৯০+ দিন': ads.filter(function (a) { var d = daysDiff(a.start_date); return d !== null && d > 90; }).map(function (a) { return a.id; }) };
        window._drawerData = window._drawerData || {};
        var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">';
        Object.keys(byRange).forEach(function (k, tidx) { var key = 'timeline_' + tidx; window._drawerData[key] = { title: k + ' Ads', subtitle: byRange[k] + ' টি ad', ids: rangeAds[k] || [] }; html += '<div class="type-block clickable" onclick="showDrawer(\'' + key + '\')" title="Click to see"><div class="type-block-label">' + k + '</div><div class="type-block-val">' + byRange[k] + '</div><div class="type-block-sub">👆 click</div></div>'; });
        html += '</div>';
        html += adsWithDays.map(function (x) { var barW = maxD > 0 && x.days !== null ? Math.max(2, Math.round(x.days / maxD * 100)) : 2; var dl = durLabel(x.days); var barCls = durBarClass(x.days); return '<div class="timeline-item"><div class="timeline-id">Ad ' + x.ad.id + '</div><div class="timeline-bar-wrap"><div class="timeline-bar-track"><div class="timeline-bar-fill ' + barCls + '" style="width:' + barW + '%"></div></div></div><div class="timeline-days">' + (x.days !== null ? x.days + 'দিন' : '?') + '</div><div class="timeline-start">' + (x.ad.start_date ? x.ad.start_date.substring(0, 10) : 'অজানা') + '</div></div>'; }).join('');
        document.getElementById('timeline-content').innerHTML = html;
      }

      // ---- APPROACH ----
      function renderApproach(data) {
        if (!data) return;
        var sections = [['Primary Strategy', data.primary_strategy], ['Messaging Focus', data.messaging_focus], ['Audience Signals', data.audience_signals], ['Testing Signals', data.testing_signals]];
        var html = '';
        if (data.overall_assessment) html += '<div class="ai-insight" style="margin-bottom:16px"><div class="ai-insight-label">Overall Assessment</div><div class="ai-insight-text">' + esc(data.overall_assessment) + '</div></div>';
        html += '<div class="approach-grid">';
        sections.forEach(function (s) { if (!s[1]) return; html += '<div class="approach-card"><div class="approach-label">' + s[0] + '</div><div class="approach-content">' + esc(s[1]) + '</div></div>'; });
        html += '</div>';
        document.getElementById('approach-content').innerHTML = html;
      }

      // ---- RECOMMENDATIONS ----
      function renderRecommendations(recs) {
        if (!recs || !recs.length) return;
        var priMap = { high: 'pri-high', medium: 'pri-mid', low: 'pri-low' };
        var priLabel = { high: 'High Priority', medium: 'Medium Priority', low: 'Low Priority' };
        var html = '<div class="rec-list">';
        recs.forEach(function (rec, i) { html += '<div class="rec-item"><div class="rec-num">' + (i + 1) + '</div><div class="rec-body"><div class="rec-title">' + esc(rec.title || '') + '</div><div class="rec-desc">' + esc(rec.description || '') + '</div><span class="rec-priority ' + (priMap[rec.priority] || 'pri-mid') + '">' + (priLabel[rec.priority] || 'Medium') + '</span></div></div>'; });
        html += '</div>';
        document.getElementById('rec-content').innerHTML = html;
      }

      // ---- ADS GROUPED ----
      function renderAdsGrouped(ads) {
        var groups = {};
        ads.forEach(function (ad) { var fmt = (ad.format || 'unknown').toLowerCase(); var key = fmt.includes('video') ? 'Video' : fmt.includes('image') ? 'Image' : fmt.includes('carousel') ? 'Carousel' : 'অন্যান্য'; if (!groups[key]) groups[key] = []; groups[key].push(ad); });
        var order = ['Video', 'Image', 'Carousel', 'অন্যান্য'];
        var fmtKeys = order.filter(function (k) { return groups[k]; });
        document.getElementById('ftabs').innerHTML = ['সব'].concat(fmtKeys).map(function (k, i) { var cnt = k === 'সব' ? ads.length : groups[k].length; return '<button class="ftab' + (i === 0 ? ' active' : '') + '" onclick="switchTab(\'' + k + '\',this)">' + k + '<span class="cnt">' + cnt + '</span></button>'; }).join('');
        document.getElementById('ads-groups').innerHTML = fmtKeys.map(function (fmt) { return '<div class="format-group visible" id="grp-' + fmt + '"><div class="fgroup-title">' + fmt + ' Ads (' + groups[fmt].length + ' টি)</div><div class="ads-grid">' + groups[fmt].map(function (ad) { return renderAdCard(ad); }).join('') + '</div></div>'; }).join('');
      }

      function switchTab(key, btn) {
        document.querySelectorAll('.ftab').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        document.querySelectorAll('.format-group').forEach(function (g) { g.classList.toggle('visible', key === 'সব' || g.id === 'grp-' + key); });
      }
      window.switchTab = switchTab;

      function renderAdCard(ad) {
        var days = daysDiff(ad.start_date); var dl = durLabel(days);
        var fmtCls = (ad.format || '').includes('video') ? 'fmt-video' : (ad.format || '').includes('carousel') ? 'fmt-carousel' : 'fmt-image';
        var mediaHtml = '';
        if (ad.videos && ad.videos.length > 0) {
          mediaHtml = '<div class="ad-media"><video src="' + esc(ad.videos[0]) + '" controls' + (ad.thumbnail ? ' poster="' + esc(ad.thumbnail) + '"' : '') + ' style="width:100%"></video><span class="ad-fmt-badge fmt-video">VIDEO</span>' + (ad.library_url ? '<a class="ad-lib-link" href="' + esc(ad.library_url) + '" target="_blank">Library ↗</a>' : '') + '</div>';
        } else if (ad.images && ad.images.length > 0) {
          mediaHtml = '<div class="ad-media"><img src="' + esc(ad.images[0]) + '" loading="lazy" alt="" onerror="this.style.display=\'none\'"/><span class="ad-fmt-badge ' + fmtCls + '">' + (ad.format || 'image').toUpperCase() + '</span>' + (ad.library_url ? '<a class="ad-lib-link" href="' + esc(ad.library_url) + '" target="_blank">Library ↗</a>' : '') + '</div>';
        } else if (ad.library_url) {
          mediaHtml = '<div class="ad-media"><div class="ad-media-empty"><a href="' + esc(ad.library_url) + '" target="_blank" style="color:var(--accent)">Ad Library তে দেখো ↗</a></div></div>';
        }
        var body = ad.body || ''; var bodyId = 'abd-' + ad.id; var hasMore = body.length > 150; var shortBody = hasMore ? body.substring(0, 150) + '…' : body; var safeBody = body.replace(/`/g, "'").replace(/\n/g, '\\n');
        var expandBtn = hasMore ? '<button class="xbtn" onclick="expandBodyText(\'' + bodyId + '\',this,`' + safeBody + '`)">See more ▾</button>' : '';
        var tags = ''; if (ad.cta) tags += '<span class="ctatag">' + esc(ad.cta) + '</span>'; if (ad.platform) tags += '<span class="atag">' + esc(ad.platform) + '</span>'; if (ad.start_date) tags += '<span class="atag">' + esc(ad.start_date.substring(0, 10)) + '</span>';
        return '<div class="ad-card">' + mediaHtml + '<div class="ad-content"><div class="ad-num">AD #' + ad.id + '</div>' + (dl.cls ? '<div class="ad-duration-badge ' + dl.cls + '">⏱ ' + dl.text + '</div>' : '') + (ad.title ? '<div class="ad-title-txt">' + esc(ad.title) + '</div>' : '') + (body ? '<div class="ad-body-label">Primary Text</div><div class="ad-body-txt" id="' + bodyId + '">' + esc(shortBody) + '</div>' + expandBtn : '<div class="ad-body-txt" style="color:var(--text3);font-style:italic">primary text নেই</div>') + '<div class="ad-footer">' + tags + '</div></div></div>';
      }

      // ---- DRAWER ----
      window._drawerData = {};
      function showDrawer(key) { var d = window._drawerData[key]; if (!d) return; openDrawer(d.title, d.subtitle, d.ids); }
      function openDrawer(title, subtitle, adIds) {
        document.getElementById('drawer-title').textContent = title;
        document.getElementById('drawer-subtitle').textContent = subtitle;
        var filtered = adIds && adIds.length ? allAds.filter(function (a) { return adIds.indexOf(a.id) !== -1; }) : allAds;
        var html = filtered.length === 0 ? '<p style="color:var(--text3);font-size:13px">কোনো matching ad পাওয়া যায়নি</p>' : filtered.map(function (ad) {
          var body = ad.body || ''; var imgHtml = ad.images && ad.images[0] ? '<img src="' + esc(ad.images[0]) + '" class="drawer-ad-img" onerror="this.style.display=\'none\'" loading="lazy"/>' : '';
          var tags = ''; if (ad.cta) tags += '<span class="atag">' + esc(ad.cta) + '</span>'; if (ad.format) tags += '<span class="atag">' + esc(ad.format) + '</span>'; if (ad.start_date) tags += '<span class="atag">' + esc(ad.start_date.substring(0, 10)) + '</span>'; var days = daysDiff(ad.start_date); if (days !== null) tags += '<span class="atag">' + days + 'দিন</span>';
          return '<div class="drawer-ad"><div class="drawer-ad-num">AD #' + ad.id + '</div>' + imgHtml + (ad.title ? '<div class="drawer-ad-title">' + esc(ad.title) + '</div>' : '') + (body ? '<div class="drawer-ad-body">' + esc(body.substring(0, 400)) + (body.length > 400 ? '…' : '') + '</div>' : '') + '<div class="drawer-ad-tags">' + tags + '</div>' + (ad.library_url ? '<div style="margin-top:8px"><a href="' + esc(ad.library_url) + '" target="_blank" style="font-size:11px;color:var(--accent)">Ad Library তে দেখো ↗</a></div>' : '') + '</div>';
        }).join('');
        document.getElementById('drawer-body').innerHTML = html;
        document.getElementById('drawer').classList.add('open');
        document.getElementById('drawer-overlay').classList.add('open');
      }
      function closeDrawer() { document.getElementById('drawer').classList.remove('open'); document.getElementById('drawer-overlay').classList.remove('open'); }
      window.showDrawer = showDrawer;
      window.closeDrawer = closeDrawer;

      // ---- PDF ----
      function downloadPDF() {
        var dBtn = document.getElementById('dl-btn'); var oldText = dBtn.innerHTML;
        dBtn.innerHTML = '⏳ রিপোর্ট প্রসেস হচ্ছে...'; dBtn.style.opacity = '0.7'; dBtn.style.pointerEvents = 'none';
        setTimeout(function () {
          var element = document.getElementById('dashboard'); var company = document.getElementById('dash-company').textContent || 'Report';
          var opt = { margin: [10, 10, 10, 10], filename: company + '.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, logging: false }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } };
          html2pdf().set(opt).from(element).save().then(function () { dBtn.innerHTML = oldText; dBtn.style.opacity = '1'; dBtn.style.pointerEvents = 'auto'; }).catch(function () { dBtn.innerHTML = oldText; dBtn.style.opacity = '1'; dBtn.style.pointerEvents = 'auto'; });
        }, 100);
      }
      window.downloadPDF = downloadPDF;

      // ---- AI AD GENERATOR ----
      async function generateAdsBrief() {
        if (!keys.c) { alert('Claude API Key সেট করা নেই!'); return; }
        var company = document.getElementById('company').value.trim();
        var btn = document.getElementById('gen-btn'); var load = document.getElementById('gen-loading'); var res = document.getElementById('gen-results');
        btn.style.display = 'none'; load.style.display = 'block'; res.style.display = 'none';
        var prompt = 'You just analyzed Meta ads for ' + company + '. Based on their most successful strategies (like prominent CTAs, effective hooks, and messaging patterns), act as an expert South Asian copywriter. Generate 3 unique "Ad Briefs" for a direct competitor of ' + company + ' to beat them.\n\nEach brief must include:\n1. Hook/Headline: Very catchy, using psychology.\n2. Primary Text: The main body text using PAS or AIDA.\n3. Creative Idea: Description of image/video to use.\n4. CTA: Best button to use.\n\nReturn JSON ONLY. Format:\n{"ads":[{"hook":"text","primary_text":"text","creative_idea":"text","cta":"text"}]}\n\nKeep all text in Bangla except the CTA value.';
        try {
          var r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': keys.c, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }) });
          if (!r.ok) { var e; try { e = await r.json(); } catch (x) { throw new Error('Claude API error'); } throw new Error((e.error && e.error.message) || 'Claude API error'); }
          var d = await r.json(); var raw = d.content && d.content.map(function (c) { return c.text || ''; }).join('') || '';
          var js = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '').trim();
          var start = js.indexOf('{'); var end = js.lastIndexOf('}'); if (start !== -1 && end !== -1) js = js.substring(start, end + 1);
          var data = JSON.parse(js);
          var html = '';
          data.ads.forEach(function (ad, i) {
            html += '<div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--rs); padding:16px;">';
            html += '<div style="font-size:12px; font-weight:700; color:var(--accent); text-transform:uppercase; margin-bottom:8px;">Idea ' + (i + 1) + '</div>';
            html += '<div style="margin-bottom:8px;"><strong>Hook:</strong> <span style="color:var(--text2)">' + esc(ad.hook) + '</span></div>';
            html += '<div style="margin-bottom:8px;"><strong>Copy:</strong> <div style="color:var(--text2); white-space:pre-wrap; margin-top:4px;">' + esc(ad.primary_text) + '</div></div>';
            html += '<div style="margin-bottom:8px;"><strong>Creative:</strong> <span style="color:var(--text2)">' + esc(ad.creative_idea) + '</span></div>';
            html += '<div><strong>CTA:</strong> <span style="display:inline-block; font-size:11px; font-weight:600; padding:2px 8px; background:var(--blue-bg); color:var(--blue); border-radius:4px;">' + esc(ad.cta) + '</span></div></div>';
          });
          res.innerHTML = html; load.style.display = 'none'; res.style.display = 'flex'; btn.style.display = 'inline-block'; btn.textContent = '🔄 আবার জেনারেট করো';
        } catch (e) { load.style.display = 'none'; btn.style.display = 'inline-block'; alert('কোথাও সমস্যা হয়েছে! আবার চেষ্টা করুন।'); }
      }
      window.generateAdsBrief = generateAdsBrief;
    };

    // Run after CDN scripts are loaded
    if (document.readyState === 'complete') { init(); }
    else { window.addEventListener('load', init); }
  }, []);

  return (
    <>
      {/* TOPBAR */}
      <div className="topbar">
        <div className="wrap">
          <div className="topbar-inner">
            <div className="logo" onClick={() => window.resetAll && window.resetAll()} style={{ cursor: 'pointer' }}>
              <div className="logo-icon">
                <svg viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1.5" fill="white" />
                  <rect x="9" y="1" width="6" height="6" rx="1.5" fill="white" />
                  <rect x="1" y="9" width="6" height="6" rx="1.5" fill="white" />
                  <rect x="9" y="9" width="6" height="6" rx="1.5" fill="white" opacity=".35" />
                </svg>
              </div>
              <span className="logo-name">Meta Ads Intelligence</span>
            </div>
            <div className="topbar-right">
              <div className="key-indicator" onClick={() => window.openModal && window.openModal()} id="key-indicator">
                <div className="key-dot" id="key-dot" style={{ background: 'var(--red)' }}></div>
                <span id="key-label">API Keys সেট করো</span>
              </div>
              <button className="hamburger-btn" id="hamburger-btn" onClick={() => window.openNavMenu && window.openNavMenu()} data-html2canvas-ignore="true">
                <span></span><span></span><span></span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* NAV FLYOUT */}
      <div className="nav-overlay" id="nav-overlay" onClick={() => window.closeNavMenu && window.closeNavMenu()}></div>
      <div className="nav-flyout" id="nav-flyout">
        <div className="nav-flyout-header">
          <span className="nav-flyout-title">Quick Navigation</span>
          <button className="nav-flyout-close" onClick={() => window.closeNavMenu && window.closeNavMenu()}>✕</button>
        </div>
        <ul>
          <li onClick={() => window.navTo && window.navTo('dash-company')}><span className="nav-icon">📊</span> Overview &amp; Stats</li>
          <li onClick={() => window.navTo && window.navTo('cta-card')}><span className="nav-icon">🎯</span> CTA &amp; Headings</li>
          <li onClick={() => window.navTo && window.navTo('body-analysis-top')}><span className="nav-icon">📝</span> Body Copy Analysis</li>
          <li onClick={() => window.navTo && window.navTo('creative-content')}><span className="nav-icon">🎨</span> Creatives &amp; Platform</li>
          <li onClick={() => window.navTo && window.navTo('timeline-content')}><span className="nav-icon">📅</span> Timeline &amp; Approach</li>
          <li onClick={() => window.navTo && window.navTo('ad-generator-section')}><span className="nav-icon">✨</span> AI Generator</li>
          <li onClick={() => window.navTo && window.navTo('ads-groups')}><span className="nav-icon">📚</span> Ad Library</li>
        </ul>
      </div>

      {/* KEY MODAL */}
      <div className="modal-overlay" id="modal">
        <div className="modal">
          <h3>API Keys</h3>
          <div className="mfield">
            <label>Claude (Anthropic) API Key</label>
            <input type="password" id="ckey" placeholder="sk-ant-..." />
          </div>
          <div className="mfield">
            <label>SearchAPI Key — <a href="https://www.searchapi.io" target="_blank" style={{ color: 'var(--accent)' }}>searchapi.io</a> থেকে নাও</label>
            <input type="password" id="skey" placeholder="SearchAPI key..." />
          </div>
          <div className="modal-btns">
            <button className="modal-save" onClick={() => window.saveKeys && window.saveKeys()}>সেভ করো</button>
            <button className="modal-cancel" onClick={() => window.closeModal && window.closeModal()}>বাতিল</button>
          </div>
        </div>
      </div>

      <div className="wrap">
        {/* HERO */}
        <div className="hero" id="hero-section">
          <div className="hero-label">Competitive Intelligence Tool</div>
          <h1>যেকোনো ব্র্যান্ডের<br /><em>Meta Ad Strategy</em> ডিকোড করুন নিমিষেই</h1>
          <p>কম্পিটিটরদের হিডেন মার্কেটিং স্ট্র্যাটেজি এবং উইনিং অ্যাডসগুলো অ্যানালাইজ করুন খুব সহজে, আর বানিয়ে নিন আপনার উইনিং অ্যাড স্ট্র্যাটেজি।</p>
          <div className="search-box">
            <div className="search-row">
              <input type="text" className="sinp" id="company" placeholder="কোম্পানির নাম — যেমন: Shajgoj, Daraz, bKash, Takhfee" />
              <select id="country">
                <option value="BD">Bangladesh</option>
                <option value="IN">India</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
                <option value="ALL">সব দেশ</option>
              </select>
              <button className="go-btn" id="go-btn" onClick={() => window.go && window.go()}>অ্যানালাইজ করুন →</button>
            </div>
            <div className="search-opts">
              <div className="opt-item">
                <span>সর্বোচ্চ Ads:</span>
                <input type="range" id="maxads" min="10" max="50" defaultValue="20" step="10" onChange={(e) => { document.getElementById('maxval').textContent = e.target.value; }} />
                <span id="maxval" style={{ fontWeight: 600 }}>20</span>
              </div>
              <span className="opt-note">বেশি ads = ভালো analysis, বেশি API request</span>
            </div>
          </div>
        </div>

        <div className="errbox" id="errbox"></div>

        {/* LOADING */}
        <div className="loading" id="loading">
          <div className="spinner"></div>
          <div className="loading-txt" id="ltxt">অ্যাড লাইব্রেরি থেকে ডেটা কালেক্ট করা হচ্ছে...</div>
          <div className="loading-sub" id="lsub">অনুগ্রহ করে অপেক্ষা করুন</div>
        </div>

        {/* DASHBOARD */}
        <div className="dashboard" id="dashboard">
          <div className="dash-layout">
            <div className="dash-content">
              {/* DASH HEADER */}
              <div className="dash-header">
                <div>
                  <div className="dash-company" id="dash-company"></div>
                  <div className="dash-meta" id="dash-meta"></div>
                </div>
                <div className="dash-actions" data-html2canvas-ignore="true">
                  <button id="dl-btn" className="dash-back" onClick={() => window.downloadPDF && window.downloadPDF()} style={{ background: 'var(--accent)', color: 'var(--white)', borderColor: 'var(--accent)', fontWeight: 600 }}>
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" /></svg> রিপোর্ট ডাউনলোড
                  </button>
                  <button className="dash-back" onClick={() => window.resetAll && window.resetAll()}>
                    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ marginRight: 4, verticalAlign: -2 }}><path d="M21 11H6.83l3.58-3.59L9 6l-6 6 6 6 1.41-1.41L6.83 13H21v-2z" /></svg> নতুন সার্চ
                  </button>
                </div>
              </div>

              {/* STAT CARDS */}
              <div className="stat-row" id="stat-row"></div>

              {/* CTA + Heading */}
              <div className="section-grid">
                <div className="card" id="cta-card">
                  <div className="card-header"><span className="card-title">CTA Button Analysis</span><span className="card-badge badge-accent">Button Strategy</span></div>
                  <div id="cta-content"></div>
                </div>
                <div className="card" id="heading-card">
                  <div className="card-header"><span className="card-title">Heading Text Analysis</span><span className="card-badge badge-blue">Headlines</span></div>
                  <div id="heading-content"></div>
                </div>
              </div>

              {/* Body Text */}
              <div className="section-full">
                <div className="card">
                  <div className="card-header"><span className="card-title">Body Text (Primary Text) Analysis</span><span className="card-badge badge-purple">Copy Intelligence</span></div>
                  <div id="body-analysis-top"></div>
                  <div id="body-list"></div>
                </div>
              </div>

              {/* Creative + Platform */}
              <div className="section-grid">
                <div className="card">
                  <div className="card-header"><span className="card-title">Creative Analysis</span><span className="card-badge badge-amber">Visual Strategy</span></div>
                  <div id="creative-content"></div>
                </div>
                <div className="card">
                  <div className="card-header"><span className="card-title">Platform Analysis</span><span className="card-badge badge-blue">Distribution</span></div>
                  <div id="platform-content"></div>
                </div>
              </div>

              {/* Timeline */}
              <div className="section-full">
                <div className="card">
                  <div className="card-header"><span className="card-title">Ads Timeline Analysis</span><span className="card-badge badge-green">Duration Intelligence</span></div>
                  <div id="timeline-content"></div>
                </div>
              </div>

              {/* Marketing Approach */}
              <div className="section-full">
                <div className="card">
                  <div className="card-header"><span className="card-title">Marketing Approach Analysis</span><span className="card-badge badge-purple">AI Analysis</span></div>
                  <div id="approach-content"></div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="section-full">
                <div className="card">
                  <div className="card-header"><span className="card-title">Recommendation for You</span><span className="card-badge badge-green">Action Items</span></div>
                  <div id="rec-content"></div>
                </div>
              </div>

              {/* AI Generator */}
              <div className="section-full" id="ad-generator-section">
                <div className="card" id="pdf-ignore-gen">
                  <div className="card-header"><span className="card-title">AI Ad Brief Generator</span><span className="card-badge badge-accent">Create New</span></div>
                  <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>কম্পিটিটরের অ্যানালাইসিসের উপর ভিত্তি করে এআই-এর সাহায্যে নতুন ৩টি প্রফেশনাল অ্যাড কপি ও ক্রিয়েটিভ আইডিয়া জেনারেট করুন।</p>
                  <button className="go-btn" id="gen-btn" onClick={() => window.generateAdsBrief && window.generateAdsBrief()} data-html2canvas-ignore="true">✨ নতুন অ্যাড আইডিয়া জেনারেট করুন</button>
                  <div id="gen-loading" style={{ display: 'none', marginTop: 14, fontSize: 13, color: 'var(--text3)' }}>
                    <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, margin: '0 10px 0 0', display: 'inline-block', verticalAlign: 'middle' }}></div>
                    এআই নতুন আইডিয়া জেনারেট করছে...
                  </div>
                  <div id="gen-results" style={{ marginTop: 20, display: 'none', flexDirection: 'column', gap: 12 }}></div>
                </div>
              </div>

              {/* All Ads */}
              <div className="section-full">
                <div className="card">
                  <div className="card-header"><span className="card-title">সব Ads — Format অনুযায়ী</span><span className="card-badge badge-accent">Ad Library</span></div>
                  <div className="ads-section">
                    <div className="format-tabs" id="ftabs"></div>
                    <div id="ads-groups"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DRAWER */}
        <div className="drawer-overlay" id="drawer-overlay" onClick={() => window.closeDrawer && window.closeDrawer()}></div>
        <div className="drawer" id="drawer">
          <div className="drawer-header">
            <div>
              <div className="drawer-title" id="drawer-title"></div>
              <div className="drawer-subtitle" id="drawer-subtitle"></div>
            </div>
            <button className="drawer-close" onClick={() => window.closeDrawer && window.closeDrawer()}>✕</button>
          </div>
          <div className="drawer-body" id="drawer-body"></div>
        </div>

        <footer>Meta Ads Intelligence · SearchAPI.io + Claude AI · <span id="today-date"></span></footer>
      </div>
    </>
  );
}
