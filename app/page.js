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

      // ---- MY ADS REPORTING ----
      var currentMainTab = 'competitor';
      var myAdsData = null;
      var myAdsIsDemo = false;
      var myAdsDatePreset = 'last_30d';
      var myAdsStartDate = '';
      var myAdsEndDate = '';

      function toggleDatePicker() {
        var dropdown = document.getElementById('my-ads-date-picker-dropdown');
        if (!dropdown) return;
        if (dropdown.style.display === 'none' || !dropdown.style.display) {
          dropdown.style.display = 'block';
          if (myAdsStartDate) {
            var sInput = document.getElementById('my-ads-start-date');
            if (sInput) sInput.value = myAdsStartDate;
          }
          if (myAdsEndDate) {
            var eInput = document.getElementById('my-ads-end-date');
            if (eInput) eInput.value = myAdsEndDate;
          }
        } else {
          dropdown.style.display = 'none';
        }
      }
      window.toggleDatePicker = toggleDatePicker;

      if (typeof window !== 'undefined') {
        window.addEventListener('click', function(e) {
          var wrapper = document.getElementById('my-ads-datepicker-wrapper');
          var dropdown = document.getElementById('my-ads-date-picker-dropdown');
          if (wrapper && dropdown && !wrapper.contains(e.target)) {
            dropdown.style.display = 'none';
          }
        });
      }

      function selectDatePreset(preset, label) {
        myAdsDatePreset = preset;
        
        var today = new Date();
        var start = new Date();
        var end = new Date();

        var formatDate = function(d) {
          var yyyy = d.getFullYear();
          var mm = String(d.getMonth() + 1).padStart(2, '0');
          var dd = String(d.getDate()).padStart(2, '0');
          return yyyy + '-' + mm + '-' + dd;
        };

        if (preset === 'today') {
          myAdsStartDate = formatDate(start);
          myAdsEndDate = formatDate(end);
        } else if (preset === 'yesterday') {
          start.setDate(today.getDate() - 1);
          end.setDate(today.getDate() - 1);
          myAdsStartDate = formatDate(start);
          myAdsEndDate = formatDate(end);
        } else {
          var days = 30;
          if (preset === 'last_3d') days = 3;
          else if (preset === 'last_5d') days = 5;
          else if (preset === 'last_7d') days = 7;
          else if (preset === 'last_10d') days = 10;
          else if (preset === 'last_14d') days = 14;
          else if (preset === 'last_30d') days = 30;
          else if (preset === 'last_90d') days = 90;

          start.setDate(today.getDate() - days);
          end.setDate(today.getDate() - 1);
          myAdsStartDate = formatDate(start);
          myAdsEndDate = formatDate(end);
        }

        var btnLabel = document.getElementById('my-ads-date-btn-label');
        if (btnLabel) {
          btnLabel.textContent = label + ' (' + myAdsStartDate + ' - ' + myAdsEndDate + ')';
        }
        
        var dropdown = document.getElementById('my-ads-date-picker-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        reloadMyAdsData();
      }
      window.selectDatePreset = selectDatePreset;

      function applyCustomCalendarRange() {
        var sInput = document.getElementById('my-ads-start-date');
        var eInput = document.getElementById('my-ads-end-date');
        if (!sInput || !eInput) return;
        var startVal = sInput.value;
        var endVal = eInput.value;
        
        if (!startVal || !endVal) {
          alert('অনুগ্রহ করে শুরুর এবং শেষের তারিখ নির্বাচন করুন।');
          return;
        }

        if (new Date(startVal) > new Date(endVal)) {
          alert('শুরুর তারিখ অবশ্যই শেষের তারিখের চেয়ে আগে হতে হবে।');
          return;
        }

        myAdsDatePreset = 'custom';
        myAdsStartDate = startVal;
        myAdsEndDate = endVal;

        var displayLabel = 'Custom Range (' + startVal + ' - ' + endVal + ')';
        var btnLabel = document.getElementById('my-ads-date-btn-label');
        if (btnLabel) {
          btnLabel.textContent = displayLabel;
        }
        
        var dropdown = document.getElementById('my-ads-date-picker-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        
        reloadMyAdsData();
      }
      window.applyCustomCalendarRange = applyCustomCalendarRange;

      function switchMainTab(tab) {
        currentMainTab = tab;
        document.querySelectorAll('.top-tab').forEach(function(b) { b.classList.remove('active'); });
        if (tab === 'competitor') {
          document.getElementById('tab-competitor').classList.add('active');
          document.getElementById('my-ads-section').style.display = 'none';
          
          var isDashboardOpen = document.body.classList.contains('dashboard-open');
          if (isDashboardOpen) {
            document.getElementById('dashboard').style.display = 'block';
            document.getElementById('hero-section').style.display = 'none';
          } else {
            document.getElementById('dashboard').style.display = 'none';
            document.getElementById('hero-section').style.display = 'block';
          }
        } else {
          document.getElementById('tab-myads').classList.add('active');
          document.getElementById('my-ads-section').style.display = 'block';
          
          document.getElementById('dashboard').style.display = 'none';
          document.getElementById('hero-section').style.display = 'none';
          
          var hasMyAdsReport = document.getElementById('my-ads-dashboard').style.display === 'block';
          if (hasMyAdsReport) {
            document.body.classList.add('dashboard-open');
          } else {
            document.body.classList.remove('dashboard-open');
          }
        }
      }
      window.switchMainTab = switchMainTab;

      function showMyAdsErr(msg) {
        var el = document.getElementById('my-ads-errbox');
        el.textContent = msg; el.style.display = 'block';
        document.getElementById('my-ads-loading').style.display = 'none';
      }
      function setMyAdsLoad(t, s) {
        document.getElementById('my-ads-ltxt').textContent = t;
        document.getElementById('my-ads-lsub').textContent = s || '';
        document.getElementById('my-ads-loading').style.display = 'block';
        document.getElementById('my-ads-errbox').style.display = 'none';
      }

      async function connectMetaAds(isDemo) {
        var token = '';
        var accountId = '';
        
        myAdsIsDemo = isDemo;
        
        if (isDemo) {
          token = 'DEMO_TOKEN';
          accountId = 'act_123456789_demo';
        } else {
          token = document.getElementById('meta-token').value.trim();
          accountId = document.getElementById('meta-account-id').value.trim();
          if (!token || !accountId) {
            alert('Access Token এবং Account ID দুটোই দিতে হবে।');
            return;
          }
        }
        
        document.getElementById('my-ads-conn-card').style.display = 'none';
        document.getElementById('my-ads-dashboard').style.display = 'none';
        document.getElementById('my-ads-errbox').style.display = 'none';
        
        setMyAdsLoad('Meta Ad Account থেকে ডেটা রিট্রিভ করা হচ্ছে...', isDemo ? 'ডেমো অ্যাকাউন্ট সেটআপ করা হচ্ছে' : 'ক্যাম্পেইন ও ক্রিয়েটিভ পারফরম্যান্স লোড হচ্ছে');
        
        try {
          var datePreset = myAdsDatePreset || 'last_30d';
          var data;
          if (isDemo) {
            await new Promise(function(resolve) { setTimeout(resolve, 800); });
            data = getDemoData();
          } else {
            var r = await fetch('/api/meta-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                metaToken: token, 
                metaAccountId: accountId, 
                datePreset: datePreset,
                startDate: myAdsStartDate,
                endDate: myAdsEndDate
              })
            });
            data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Meta Report Fetch Failed');
          }
          
          myAdsData = data;
          
          if (!isDemo) {
            try {
              localStorage.setItem('mai_meta_token', token);
              localStorage.setItem('mai_meta_account_id', accountId);
              localStorage.setItem('mai_meta_saved_search', JSON.stringify(data));
            } catch (e) {}
          }
          
          renderMyAdsDashboard(data);
        } catch (err) {
          document.getElementById('my-ads-conn-card').style.display = 'block';
          showMyAdsErr('সমস্যা হয়েছে: ' + err.message);
        }
      }
      window.connectMetaAds = connectMetaAds;

      async function reloadMyAdsData() {
        var token = '';
        var accountId = '';
        if (myAdsIsDemo) {
          token = 'DEMO_TOKEN';
          accountId = 'act_123456789_demo';
        } else {
          token = localStorage.getItem('mai_meta_token');
          accountId = localStorage.getItem('mai_meta_account_id');
          if (!token || !accountId) return;
        }

        document.getElementById('my-ads-dashboard').style.display = 'none';
        setMyAdsLoad('Meta API থেকে নতুন ডেটা লোড করা হচ্ছে...', myAdsIsDemo ? 'ডেমো অ্যাকাউন্ট আপডেট করা হচ্ছে' : 'সিলেক্টেড ডেট রেঞ্জের ইনফরমেশন রিট্রিভ করা হচ্ছে');
        
        try {
          if (!myAdsStartDate || !myAdsEndDate) {
            var today = new Date();
            var start = new Date();
            start.setDate(today.getDate() - 30);
            var formatDate = function(d) {
              var yyyy = d.getFullYear();
              var mm = String(d.getMonth() + 1).padStart(2, '0');
              var dd = String(d.getDate()).padStart(2, '0');
              return yyyy + '-' + mm + '-' + dd;
            };
            myAdsStartDate = formatDate(start);
            myAdsEndDate = formatDate(today);
            var btnLabel = document.getElementById('my-ads-date-btn-label');
            if (btnLabel) {
              btnLabel.textContent = 'Last 30 Days (গত ৩০ দিন) (' + myAdsStartDate + ' - ' + myAdsEndDate + ')';
            }
          }

          var data;
          if (myAdsIsDemo) {
            await new Promise(function(resolve) { setTimeout(resolve, 500); });
            
            var diffTime = Math.abs(new Date(myAdsEndDate) - new Date(myAdsStartDate));
            var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            var multiplier = diffDays / 30;
            if (multiplier < 0.05) multiplier = 0.05;

            var baseData = getDemoData();
            baseData.summary.spend = parseFloat((baseData.summary.spend * multiplier).toFixed(2));
            baseData.summary.purchases = Math.round(baseData.summary.purchases * multiplier);
            baseData.summary.revenue = parseFloat((baseData.summary.revenue * multiplier).toFixed(2));
            baseData.summary.impressions = Math.round(baseData.summary.impressions * multiplier);
            baseData.summary.clicks = Math.round(baseData.summary.clicks * multiplier);
            
            baseData.summary.ctr = baseData.summary.impressions > 0 ? (baseData.summary.clicks / baseData.summary.impressions) * 100 : 0;
            baseData.summary.cpc = baseData.summary.clicks > 0 ? baseData.summary.spend / baseData.summary.clicks : 0;
            baseData.summary.cpa = baseData.summary.purchases > 0 ? baseData.summary.spend / baseData.summary.purchases : 0;
            baseData.summary.roas = baseData.summary.spend > 0 ? baseData.summary.revenue / baseData.summary.spend : 0;

            baseData.campaigns.forEach(function(c) {
              c.spend = parseFloat((c.spend * multiplier).toFixed(2));
              c.purchases = Math.round(c.purchases * multiplier);
              c.impressions = Math.round(c.impressions * multiplier);
              c.clicks = Math.round(c.clicks * multiplier);
              c.roas = c.spend > 0 ? (c.purchases * 40) / c.spend : 0;
              c.cpa = c.purchases > 0 ? c.spend / c.purchases : 0;
            });

            baseData.ads.forEach(function(a) {
              a.spend = parseFloat((a.spend * multiplier).toFixed(2));
              a.purchases = Math.round(a.purchases * multiplier);
              a.impressions = Math.round(a.impressions * multiplier);
              a.clicks = Math.round(a.clicks * multiplier);
              a.roas = a.spend > 0 ? (a.purchases * 40) / a.spend : 0;
              a.cpa = a.purchases > 0 ? a.spend / a.purchases : 0;
            });
            data = baseData;
          } else {
            var r = await fetch('/api/meta-reports', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                metaToken: token, 
                metaAccountId: accountId, 
                datePreset: myAdsDatePreset,
                startDate: myAdsStartDate,
                endDate: myAdsEndDate
              })
            });
            data = await r.json();
            if (!r.ok) throw new Error(data.error || 'Fetch failed');
          }
          
          myAdsData = data;
          renderMyAdsDashboard(data);
        } catch(err) {
          showMyAdsErr('লোড করতে সমস্যা হয়েছে: ' + err.message);
        }
      }
      window.reloadMyAdsData = reloadMyAdsData;

      function filterMyAdsDisplay() {
        if (!myAdsData) return;

        var selectedCampaign = document.getElementById('my-ads-campaign-filter').value;
        var selectedStatus = document.getElementById('my-ads-status-filter').value;

        // Filter the Ads list
        var filteredAds = myAdsData.ads.filter(function(ad) {
          var matchesCampaign = selectedCampaign === 'ALL' || 
            String(ad.campaign_id) === String(selectedCampaign) || 
            ad.campaign_name === selectedCampaign;
          
          var adStatusClean = String(ad.status).toUpperCase();
          var matchesStatus = selectedStatus === 'ALL' || 
            (selectedStatus === 'ACTIVE' && (adStatusClean === 'ACTIVE' || adStatusClean === 'EFFECTIVE_ACTIVE' || adStatusClean === 'PENDING_REVIEW')) ||
            (selectedStatus === 'PAUSED' && (adStatusClean === 'PAUSED' || adStatusClean === 'DISABLED' || adStatusClean === 'ARCHIVED'));

          return matchesCampaign && matchesStatus;
        });

        // Compute new KPIs for the filtered subset
        var spend = 0, impressions = 0, clicks = 0, purchases = 0, revenue = 0;
        
        filteredAds.forEach(function(ad) {
          spend += ad.spend || 0;
          impressions += ad.impressions || 0;
          clicks += ad.clicks || 0;
          purchases += ad.purchases || 0;
          revenue += ad.purchaseValue || (ad.purchases * 40) || 0;
        });

        var ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        var cpc = clicks > 0 ? spend / clicks : 0;
        var cpa = purchases > 0 ? spend / purchases : 0;
        var roas = spend > 0 ? revenue / spend : 0;

        var formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        var formatCurrency = function(val) { return formatter.format(val); };

        document.getElementById('my-ads-stat-row').innerHTML = [
          ['খরচ (Spend)', formatCurrency(spend), 'ফিল্টারড Spend'],
          ['Purchases (Filtered)', purchases, purchases > 0 ? 'CPA: ' + formatCurrency(cpa) : 'কোনো সেল নেই'],
          ['গড় ROAS (Filtered)', roas.toFixed(2) + 'x', spend > 0 ? 'রিটার্ন ভ্যালু: ' + formatCurrency(revenue) : '0.00'],
          ['গড় CTR (Filtered)', ctr.toFixed(2) + '%', clicks + ' ক্লিকস'],
          ['গড় CPC (Filtered)', formatCurrency(cpc), 'ক্লিক প্রতি খরচ']
        ].map(function (x) { 
          return '<div class="stat"><div class="stat-label">' + x[0] + '</div><div class="stat-value">' + x[1] + '</div><div class="stat-sub">' + x[2] + '</div></div>'; 
        }).join('');

        // ---- DYNAMIC CAMPAIGN & ADSET DETAILS AUDIT ----
        var auditCard = document.getElementById('my-ads-campaign-detail-card');
        if (selectedCampaign === 'ALL') {
          auditCard.style.display = 'none';
        } else {
          var camp = myAdsData.campaigns.find(function(c) { 
            return String(c.id) === String(selectedCampaign) || c.name === selectedCampaign; 
          });
          if (camp) {
            var cCreated = camp.created_time ? new Date(camp.created_time).toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' }) : 'অজানা';
            var objMap = {
              OUTCOME_SALES: 'Sales (বিক্রি/কনভার্শন)',
              OUTCOME_LEADS: 'Leads (লিড সংগ্রহ)',
              OUTCOME_TRAFFIC: 'Traffic (ওয়েবসাইট ভিজিটর)',
              OUTCOME_ENGAGEMENT: 'Engagement (মেсеজিং/লাইক)',
              OUTCOME_AWARENESS: 'Awareness (ব্র্যান্ড পরিচিতি)',
              OUTCOME_APP_PROMOTION: 'App Promotion (অ্যাপ ইনস্টল)'
            };
            var cObj = objMap[camp.objective] || camp.objective || 'অজানা';
            var cStatus = camp.status === 'ACTIVE' 
              ? '<span style="color:var(--green);background:var(--green-bg);padding:3px 8px;border-radius:4px;font-weight:bold;font-size:11px;">● ACTIVE</span>'
              : '<span style="color:var(--text3);background:var(--bg);padding:3px 8px;border-radius:4px;font-weight:bold;font-size:11px;">● PAUSED</span>';
              
            var cBudgetType = camp.budget_type || '';
            var cBudget = cBudgetType.includes('CBO') 
              ? formatCurrency(camp.budget_value || 0) + ' (' + cBudgetType + ')'
              : 'Ad Set level (ABO)';

            // Fetch campaign adsets
            var campAdsets = myAdsData.adsets.filter(function(a) { 
              return String(a.campaign_id) === String(selectedCampaign) || String(a.campaign?.id) === String(selectedCampaign); 
            });
            
            var adsetsHtml = '';
            if (campAdsets.length === 0) {
              adsetsHtml = '<p style="color:var(--text3);font-size:13px;padding:16px 0;text-align:center;">এই ক্যাম্পেইনে কোনো Adset পাওয়া যায়নি।</p>';
            } else {
              adsetsHtml = '<div style="display:flex;flex-direction:column;gap:14px;margin-top:14px;">' +
                campAdsets.map(function(adset, idx) {
                  var adsetStatus = adset.status === 'ACTIVE' 
                    ? '<span style="font-size:11px;color:var(--green);background:var(--green-bg);padding:2px 6px;border-radius:4px;font-weight:bold;">● ACTIVE</span>' 
                    : '<span style="font-size:11px;color:var(--text3);background:var(--bg);padding:2px 6px;border-radius:4px;font-weight:bold;">● PAUSED</span>';
                    
                  var adsetBudget = adset.budget_value > 0 
                    ? formatCurrency(adset.budget_value) + ' (' + (adset.budget_type || 'Daily') + ')' 
                    : 'CBO Managed';

                  var t = adset.targeting || {};
                  
                  // Filter ads under this adset
                  var adsetAds = filteredAds.filter(function(ad) { 
                    return String(ad.adset_id) === String(adset.id) || String(ad.adset_name) === String(adset.name); 
                  });

                  var adsetAdsHtml = '';
                  if (adsetAds.length === 0) {
                    adsetAdsHtml = '<div style="font-size:12px;color:var(--text3);margin-top:10px;font-style:italic;">এই Adset-এ কোনো অ্যাক্টিভ অ্যাড পাওয়া যায়নি।</div>';
                  } else {
                    adsetAdsHtml = '<div style="margin-top:12px;border-top:1px dashed var(--border);padding-top:12px;">' +
                      '<div style="font-weight:700;font-size:13px;color:var(--text);margin-bottom:8px;">🖼️ Ads & Creatives Performance (' + adsetAds.length + 'টি Ads)</div>' +
                      '<div style="display:flex;flex-direction:column;gap:10px;">' +
                        adsetAds.map(function(ad) {
                          var adMediaHtml = '';
                          if (ad.video_url) {
                            adMediaHtml = '<div style="width:50px;height:50px;border-radius:4px;overflow:hidden;position:relative;background:#000;flex-shrink:0;"><video src="' + esc(ad.video_url) + '" ' + (ad.image_url ? 'poster="' + esc(ad.image_url) + '"' : '') + ' style="width:100%;height:100%;object-fit:cover;"></video></div>';
                          } else if (ad.image_url) {
                            adMediaHtml = '<div style="width:50px;height:50px;border-radius:4px;overflow:hidden;position:relative;background:#eee;flex-shrink:0;"><img src="' + esc(ad.image_url) + '" style="width:100%;height:100%;object-fit:cover;" onerror="this.style.display=\'none\'" /></div>';
                          } else {
                            adMediaHtml = '<div style="width:50px;height:50px;border-radius:4px;background:var(--border);display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:9px;flex-shrink:0;">No Media</div>';
                          }

                          var adStatusClean = String(ad.status).toUpperCase();
                          var isActive = adStatusClean === 'ACTIVE' || adStatusClean === 'EFFECTIVE_ACTIVE';
                          var activeStatus = isActive
                            ? '<span style="color:var(--green);font-weight:bold;">● Active</span>'
                            : '<span style="color:var(--text3);">● Paused</span>';

                          return '<div style="display:flex;gap:12px;align-items:center;background:var(--white);border:1px solid var(--border);border-radius:6px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,0.02);flex-wrap:wrap;justify-content:space-between;">' +
                            '<div style="display:flex;gap:10px;align-items:center;min-width:200px;flex:1;">' +
                              adMediaHtml +
                              '<div style="font-size:12px;min-width:0;flex:1;">' +
                                '<div style="font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + esc(ad.name) + '">' + esc(ad.name) + ' (' + activeStatus + ')</div>' +
                                (ad.title ? '<div style="color:var(--text2);font-weight:600;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Headline: ' + esc(ad.title) + '</div>' : '') +
                                (ad.body ? '<div style="color:var(--text3);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + esc(ad.body) + '">' + esc(ad.body) + '</div>' : '') +
                              '</div>' +
                            '</div>' +
                            '<div style="display:flex;gap:12px;font-size:12px;text-align:right;flex-wrap:wrap;color:var(--text2);justify-content:flex-end;">' +
                              '<div>Spend: <strong style="color:var(--text)">' + formatCurrency(ad.spend || 0) + '</strong></div>' +
                              '<div>Purchases: <strong style="color:var(--green)">' + (ad.purchases || 0) + '</strong></div>' +
                              '<div>ROAS: <strong style="color:var(--accent)">' + (ad.roas || 0).toFixed(2) + 'x</strong></div>' +
                              '<div>CTR: <strong style="color:var(--text)">' + (ad.ctr || 0).toFixed(2) + '%</strong></div>' +
                            '</div>' +
                          '</div>';
                        }).join('') +
                      '</div>' +
                    '</div>';
                  }

                  return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--rs);padding:16px;display:flex;flex-direction:column;gap:10px;">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:8px;flex-wrap:wrap;gap:8px;">' +
                      '<div style="font-weight:700;font-size:14px;color:var(--text);display:flex;align-items:center;gap:6px;">' + (idx+1) + '. ' + esc(adset.name) + ' ' + adsetStatus + '</div>' +
                      '<div style="font-size:13px;color:var(--text2)"><strong>Budget:</strong> ' + adsetBudget + '</div>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:14px;font-size:13px;color:var(--text2);">' +
                      '<div>' +
                        '<div style="font-weight:700;color:var(--text);margin-bottom:4px;">👥 Targeting (Audience)</div>' +
                        '<div style="line-height:1.5;padding-left:6px;">' +
                          '• Locations: <span style="color:var(--text)">' + esc(t.locations || 'All') + '</span><br/>' +
                          '• Age Profile: <span style="color:var(--text)">' + esc(t.age || '18-65+') + '</span> | Gender: <span style="color:var(--text)">' + esc(t.gender || 'All') + '</span><br/>' +
                          '• Detailed Targeting: <span style="color:var(--text)">' + esc(t.interests || 'Broad') + '</span><br/>' +
                          '• Placements: <span style="color:var(--text);font-weight:600">' + esc(t.placements || 'Automatic Placements') + '</span> | Destination: <span style="color:var(--text)">' + esc(adset.destination_type || 'N/A') + '</span>' +
                        '</div>' +
                      '</div>' +
                      '<div>' +
                        '<div style="font-weight:700;color:var(--text);margin-bottom:4px;">📊 Adset Performance</div>' +
                        '<div style="line-height:1.5;padding-left:6px;">' +
                          '• Spend: <span style="color:var(--text);font-weight:600">' + formatCurrency(adset.spend || 0) + '</span> | ROAS: <span style="color:var(--accent);font-weight:700">' + (adset.roas || 0).toFixed(2) + 'x</span><br/>' +
                          '• Purchases: <span style="color:var(--green);font-weight:600">' + (adset.purchases || 0) + '</span> | CPA: <span style="color:var(--text)">' + ((adset.purchases || 0) > 0 ? formatCurrency(adset.cpa || 0) : '$0.00') + '</span><br/>' +
                          '• CTR: <span style="color:var(--text)">' + (adset.ctr || 0).toFixed(2) + '%</span> | CPC: <span style="color:var(--text)">' + formatCurrency(adset.cpc || 0) + '</span>' +
                        '</div>' +
                      '</div>' +
                    '</div>' +
                    adsetAdsHtml +
                  '</div>';
                }).join('') +
              '</div>';
            }

            auditCard.innerHTML = 
              '<div class="card" style="margin-bottom:16px;">' +
                '<div class="card-header">' +
                  '<span class="card-title">📋 Campaign Level Setup & Ad Sets Audit</span>' +
                  '<span class="card-badge badge-blue">Campaign Audit</span>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:12px;background:var(--bg);padding:16px;border-radius:var(--rs);font-size:13px;color:var(--text2);margin-bottom:16px;">' +
                  '<div><strong>Campaign Status:</strong><div style="margin-top:6px;">' + cStatus + '</div></div>' +
                  '<div><strong>Objective:</strong><div style="margin-top:6px;color:var(--text);font-weight:600;">' + esc(cObj) + '</div></div>' +
                  '<div><strong>Budget Setup:</strong><div style="margin-top:6px;color:var(--text);font-weight:600;">' + cBudget + '</div></div>' +
                  '<div><strong>Created Time:</strong><div style="margin-top:6px;color:var(--text);font-weight:600;">' + cCreated + '</div></div>' +
                  '<div><strong>Total Ads Count:</strong><div style="margin-top:6px;color:var(--text);font-weight:600;">' + filteredAds.length + 'টি Ads</div></div>' +
                '</div>' +
                '<div>' +
                  '<div style="font-weight:700;font-size:15px;color:var(--text)">Ad Sets in this Campaign (' + campAdsets.length + 'টি)</div>' +
                  adsetsHtml +
                '</div>' +
              '</div>';
              
            auditCard.style.display = 'block';
          }
        }

        // Re-render creative grid for filtered ads
        var creativesGrid = document.getElementById('my-ads-creatives-grid');
        if (filteredAds.length === 0) {
          creativesGrid.innerHTML = '<p style="color:var(--text3);font-size:13px;grid-column:1/-1;text-align:center;padding:24px 0">এই ফিল্টারে কোনো অ্যাড পাওয়া যায়নি।</p>';
        } else {
          creativesGrid.innerHTML = filteredAds.map(function(ad) {
            var mediaHtml = '';
            if (ad.video_url) {
              mediaHtml = '<video src="' + esc(ad.video_url) + '" controls ' + (ad.image_url ? 'poster="' + esc(ad.image_url) + '"' : '') + ' style="width:100%;height:100%;object-fit:cover;"></video>';
            } else if (ad.image_url) {
              mediaHtml = '<img src="' + esc(ad.image_url) + '" alt="" onerror="this.style.display=\'none\'" />';
            } else {
              mediaHtml = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;">No Media Content</div>';
            }
            
            var badgeClass = 'badge-blue';
            if (ad.statusTag.includes('Top')) badgeClass = 'badge-success-alt';
            else if (ad.statusTag.includes('Under')) badgeClass = 'badge-warning-alt';
            else if (ad.statusTag.includes('Potential')) badgeClass = 'badge-scale';

            var adStatusClean = String(ad.status).toUpperCase();
            var isActive = adStatusClean === 'ACTIVE' || adStatusClean === 'EFFECTIVE_ACTIVE';
            var statusBadge = isActive 
              ? '<span style="font-size:9px;color:var(--green);background:var(--green-bg);padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:bold;">● ACTIVE</span>' 
              : '<span style="font-size:9px;color:var(--text3);background:var(--bg);padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:bold;">● PAUSED</span>';

            return '<div class="my-ad-card">' +
              '<div class="my-ad-media">' +
                mediaHtml +
                '<span class="my-ad-tag-absolute ' + badgeClass + '">' + esc(ad.statusTag) + '</span>' +
              '</div>' +
              '<div class="my-ad-info">' +
                '<div class="my-ad-header">' +
                  '<div>' +
                    '<div class="my-ad-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' + esc(ad.name) + statusBadge + '</div>' +
                    '<div class="my-ad-id-txt">ID: ' + esc(ad.ad_id) + '</div>' +
                  '</div>' +
                '</div>' +
                (ad.body ? '<div class="my-ad-body-txt">' + esc(ad.body) + '</div>' : '') +
                '<div class="my-ad-stats">' +
                  '<div class="my-ad-stat-box"><div class="my-ad-stat-lbl">Spend</div><div class="my-ad-stat-val">' + formatCurrency(ad.spend || 0) + '</div></div>' +
                  '<div class="my-ad-stat-box highlight"><div class="my-ad-stat-lbl">ROAS</div><div class="my-ad-stat-val">' + (ad.roas || 0).toFixed(2) + 'x</div></div>' +
                  '<div class="my-ad-stat-box"><div class="my-ad-stat-lbl">Purchases</div><div class="my-ad-stat-val">' + (ad.purchases || 0) + '</div></div>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('');
        }

        setTimeout(function() {
          var adNames = filteredAds.map(function(a) { return a.name.length > 20 ? a.name.substring(0, 17) + '...' : a.name; });
          var roas = filteredAds.map(function(a) { return a.roas || 0; });
          var ctrs = filteredAds.map(function(a) { return a.ctr || 0; });
          
          if (window.myAdsRoasCtrChartInst) {
            window.myAdsRoasCtrChartInst.data.labels = adNames;
            window.myAdsRoasCtrChartInst.data.datasets[0].data = roas;
            window.myAdsRoasCtrChartInst.data.datasets[1].data = ctrs;
            window.myAdsRoasCtrChartInst.update();
          }
        }, 50);
      }
      window.filterMyAdsDisplay = filterMyAdsDisplay;

      function disconnectMetaAds() {
        myAdsData = null;
        try {
          localStorage.removeItem('mai_meta_token');
          localStorage.removeItem('mai_meta_account_id');
          localStorage.removeItem('mai_meta_saved_search');
          localStorage.removeItem('mai_meta_ai_analysis');
        } catch (e) {}
        
        document.getElementById('meta-token').value = '';
        document.getElementById('meta-account-id').value = '';
        
        document.getElementById('my-ads-dashboard').style.display = 'none';
        document.getElementById('my-ads-account-banner').style.display = 'none';
        document.getElementById('my-ads-conn-card').style.display = 'block';
        document.getElementById('my-ads-errbox').style.display = 'none';
        document.getElementById('my-ads-ai-result').style.display = 'none';
        
        document.body.classList.remove('dashboard-open');
      }
      window.disconnectMetaAds = disconnectMetaAds;

      function getDemoData() {
        return {
          summary: {
            spend: 1420.00,
            impressions: 79000,
            clicks: 1740,
            purchases: 93,
            revenue: 3920.00,
            ctr: 2.20,
            cpc: 0.82,
            cpa: 15.27,
            roas: 2.76
          },
          campaigns: [
            { id: "camp_1", name: "Purchase Conversion - Prospecting", status: "ACTIVE", objective: "OUTCOME_SALES", created_time: "2026-03-15T08:00:00Z", budget_type: "CBO (Daily)", budget_value: 30.00, spend: 850, impressions: 45000, clicks: 980, ctr: 2.18, cpc: 0.87, purchases: 58, roas: 2.73, cpa: 14.65 },
            { id: "camp_2", name: "Purchase Conversion - Retargeting L30D", status: "ACTIVE", objective: "OUTCOME_SALES", created_time: "2026-04-01T09:30:00Z", budget_type: "CBO (Daily)", budget_value: 10.00, spend: 270, impressions: 12000, clicks: 310, ctr: 2.58, cpc: 0.87, purchases: 31, roas: 5.48, cpa: 8.71 },
            { id: "camp_3", name: "Messaging - Cold Leads", status: "PAUSED", objective: "OUTCOME_ENGAGEMENT", created_time: "2026-04-10T12:00:00Z", budget_type: "ABO (AdSet)", budget_value: 0, spend: 300, impressions: 22000, clicks: 450, ctr: 2.05, cpc: 0.67, purchases: 4, roas: 0.40, cpa: 75.00 }
          ],
          adsets: [
            {
              id: "adset_1",
              name: "Prospecting: Lookalike 1% Purchase",
              status: "ACTIVE",
              campaign_id: "camp_1",
              created_time: "2026-03-15T08:05:00Z",
              budget_value: 0,
              budget_type: "CBO",
              spend: 520,
              impressions: 28000,
              clicks: 647,
              ctr: 2.31,
              cpc: 0.80,
              purchases: 38,
              roas: 2.92,
              cpa: 13.68,
              targeting: { locations: "Bangladesh (BD)", age: "18 - 45", gender: "All", interests: "Shopping, Shoes, Leather Goods", placements: "Facebook, Instagram" }
            },
            {
              id: "adset_2",
              name: "Prospecting: Broad Audience Men 22-45",
              status: "ACTIVE",
              campaign_id: "camp_1",
              created_time: "2026-03-15T08:05:00Z",
              budget_value: 0,
              budget_type: "CBO",
              spend: 330,
              impressions: 17000,
              clicks: 333,
              ctr: 1.96,
              cpc: 0.99,
              purchases: 20,
              roas: 2.42,
              cpa: 16.50,
              targeting: { locations: "Bangladesh (BD)", age: "22 - 45", gender: "Men", interests: "Sports, Walking, Sneaker collecting", placements: "Facebook, Instagram, Audience Network" }
            },
            {
              id: "adset_3",
              name: "Retargeting: Website Custom Audiences 30D",
              status: "ACTIVE",
              campaign_id: "camp_2",
              created_time: "2026-04-01T09:35:00Z",
              budget_value: 0,
              budget_type: "CBO",
              spend: 270,
              impressions: 12000,
              clicks: 310,
              ctr: 2.58,
              cpc: 0.87,
              purchases: 31,
              roas: 5.48,
              cpa: 8.71,
              targeting: { locations: "Bangladesh (BD)", age: "18 - 65+", gender: "All", interests: "Retargeting: Website Visitors (30 Days)", placements: "Facebook, Instagram, Messenger, Audience Network" }
            },
            {
              id: "adset_4",
              name: "Messaging: Cold Interests Shoes",
              status: "PAUSED",
              campaign_id: "camp_3",
              created_time: "2026-04-10T12:05:00Z",
              budget_value: 10.00,
              budget_type: "Daily",
              spend: 300,
              impressions: 22000,
              clicks: 450,
              ctr: 2.05,
              cpc: 0.67,
              purchases: 4,
              roas: 0.40,
              cpa: 75.00,
              targeting: { locations: "Bangladesh (BD)", age: "18 - 35", gender: "All", interests: "Leather Shoes, Dress Shoes, Footwear", placements: "Facebook, Messenger" }
            }
          ],
          ads: [
            {
              id: 1,
              ad_id: "ad_101",
              name: "Prospecting: Premium Leather Shoes Off-50",
              campaign_id: "camp_1",
              campaign_name: "Purchase Conversion - Prospecting",
              adset_id: "adset_1",
              spend: 520,
              impressions: 28000,
              clicks: 647,
              ctr: 2.31,
              cpc: 0.80,
              purchases: 38,
              purchaseValue: 1518.40,
              roas: 2.92,
              cpa: 13.68,
              statusTag: "🔥 Top Performer",
              status: "ACTIVE",
              title: "৫০% ছাড়ে প্রিমিয়াম লেদার জুতো!",
              body: "প্রিমিয়াম লেদার জুতোয় ৫০% ফ্ল্যাট ডিসকাউন্ট! অফারটি শেষ হওয়ার আগেই আপনার জুতোটি অর্ডার করুন। ফ্রি ডেলিভারি সারা বাংলাদেশে।",
              image_url: "https://images.unsplash.com/photo-1549298916-b41d501d3772?q=80&w=600"
            },
            {
              id: 2,
              ad_id: "ad_102",
              name: "Prospecting: Comfort Walking Shoes Review",
              campaign_id: "camp_1",
              campaign_name: "Purchase Conversion - Prospecting",
              adset_id: "adset_2",
              spend: 330,
              impressions: 17000,
              clicks: 333,
              ctr: 1.96,
              cpc: 0.99,
              purchases: 20,
              purchaseValue: 801.60,
              roas: 2.42,
              cpa: 16.50,
              statusTag: "📈 High Potential",
              status: "ACTIVE",
              title: "হাঁটার জন্য আরামদায়ক জুতো",
              body: "কেন আমাদের ওয়াকিং জুতো সেরা? গ্রাহকদের রিভিউ দেখুন নিজেই। আরামদায়ক এবং দীর্ঘস্থায়ী ফিটনেস পার্টনার।",
              image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=600"
            },
            {
              id: 3,
              ad_id: "ad_103",
              name: "Retargeting: Special Bundle Offer L30D",
              campaign_id: "camp_2",
              campaign_name: "Purchase Conversion - Retargeting L30D",
              adset_id: "adset_3",
              spend: 270,
              impressions: 12000,
              clicks: 310,
              ctr: 2.58,
              cpc: 0.87,
              purchases: 31,
              purchaseValue: 1480.00,
              roas: 5.48,
              cpa: 8.71,
              statusTag: "🔥 Top Performer",
              status: "ACTIVE",
              title: "আপনি কি আপনার অর্ডারটি সম্পন্ন করতে ভুলে গেছেন?",
              body: "আপনি কি আপনার কার্ট খালি রেখে গেছেন? আমাদের স্পেশাল কার্ট রিকভারি ডিসকাউন্ট ব্যবহার করে আজই অর্ডার করুন।",
              image_url: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=600"
            },
            {
              id: 4,
              ad_id: "ad_104",
              name: "Messaging: Ask for Custom Footwear Size",
              campaign_id: "camp_3",
              campaign_name: "Messaging - Cold Leads",
              adset_id: "adset_4",
              spend: 300,
              impressions: 22000,
              clicks: 450,
              ctr: 2.05,
              cpc: 0.67,
              purchases: 4,
              purchaseValue: 120.00,
              roas: 0.40,
              cpa: 75.00,
              statusTag: "⚠️ Underperforming",
              status: "PAUSED",
              title: "কাস্টম সাইজের জুতো অর্ডার করুন",
              body: "আপনার সাইজের জুতো কি খুঁজে পাচ্ছেন না? সরাসরি আমাদের ইনবক্স করুন কাস্টম সাইজের জুতো তৈরি করে নিতে।",
              image_url: "https://images.unsplash.com/photo-1539185441755-769473a23570?q=80&w=600"
            }
          ]
        };
      }

      function renderMyAdsDashboard(data) {
        document.getElementById('my-ads-loading').style.display = 'none';
        document.getElementById('my-ads-dashboard').style.display = 'block';
        document.body.classList.add('dashboard-open');
        
        document.getElementById('my-ads-account-banner').style.display = 'flex';
        var actId = myAdsIsDemo ? 'act_123456789_demo' : document.getElementById('meta-account-id').value;
        var actName = myAdsIsDemo ? '👞 Demo Footwear Store' : 'Meta Ad Account';
        document.getElementById('my-ads-account-name').textContent = actName;
        document.getElementById('my-ads-account-id-label').textContent = actId;
        document.getElementById('my-ads-avatar').textContent = actName.charAt(0).toUpperCase();

        // Populate Campaign Filter dropdown dynamically
        var campSelect = document.getElementById('my-ads-campaign-filter');
        var previousVal = campSelect.value || 'ALL';
        campSelect.innerHTML = '<option value="ALL">All Campaigns (সব ক্যাম্পেইন)</option>';
        if (data.campaigns && data.campaigns.length > 0) {
          data.campaigns.forEach(function(c) {
            var cId = c.id || c.name;
            campSelect.innerHTML += '<option value="' + esc(cId) + '">' + esc(c.name) + '</option>';
          });
        }
        
        // Restore previously selected campaign if possible, otherwise reset to ALL
        var hasPrevious = false;
        if (data.campaigns && data.campaigns.length > 0) {
          hasPrevious = data.campaigns.some(function(c) {
            return String(c.id) === String(previousVal) || c.name === previousVal;
          });
        }
        campSelect.value = hasPrevious ? previousVal : 'ALL';
        document.getElementById('my-ads-status-filter').value = 'ALL';

        var sum = data.summary;
        var formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
        var formatCurrency = function(val) { return formatter.format(val); };

        document.getElementById('my-ads-stat-row').innerHTML = [
          ['মোট খরচ (Spend)', formatCurrency(sum.spend), 'গত ৩০ দিনে'],
          ['মোট Purchases', sum.purchases, sum.purchases > 0 ? 'CPA: ' + formatCurrency(sum.cpa) : 'কোনো সেল নেই'],
          ['গড় ROAS', sum.roas.toFixed(2) + 'x', sum.spend > 0 ? 'রিটার্ন ভ্যালু: ' + formatCurrency(sum.revenue) : '0.00'],
          ['গড় CTR', sum.ctr.toFixed(2) + '%', sum.clicks + ' ক্লিকস'],
          ['গড় CPC', formatCurrency(sum.cpc), 'ক্লিক প্রতি খরচ']
        ].map(function (x) { 
          return '<div class="stat"><div class="stat-label">' + x[0] + '</div><div class="stat-value">' + x[1] + '</div><div class="stat-sub">' + x[2] + '</div></div>'; 
        }).join('');

        var creativesGrid = document.getElementById('my-ads-creatives-grid');
        if (data.ads.length === 0) {
          creativesGrid.innerHTML = '<p style="color:var(--text3);font-size:13px;grid-column:1/-1;text-align:center;padding:24px 0">কোনো অ্যাকティブ অ্যাড পাওয়া যায়নি।</p>';
        } else {
          creativesGrid.innerHTML = data.ads.map(function(ad) {
            var mediaHtml = '';
            if (ad.video_url) {
              mediaHtml = '<video src="' + esc(ad.video_url) + '" controls ' + (ad.image_url ? 'poster="' + esc(ad.image_url) + '"' : '') + ' style="width:100%;height:100%;object-fit:cover;"></video>';
            } else if (ad.image_url) {
              mediaHtml = '<img src="' + esc(ad.image_url) + '" alt="" onerror="this.style.display=\'none\'" />';
            } else {
              mediaHtml = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:12px;">No Media Content</div>';
            }
            
            var badgeClass = 'badge-blue';
            if (ad.statusTag.includes('Top')) badgeClass = 'badge-success-alt';
            else if (ad.statusTag.includes('Under')) badgeClass = 'badge-warning-alt';
            else if (ad.statusTag.includes('Potential')) badgeClass = 'badge-scale';

            var adStatusClean = String(ad.status || 'ACTIVE').toUpperCase();
            var isActive = adStatusClean === 'ACTIVE' || adStatusClean === 'EFFECTIVE_ACTIVE';
            var statusBadge = isActive 
              ? '<span style="font-size:9px;color:var(--green);background:var(--green-bg);padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:bold;">● ACTIVE</span>' 
              : '<span style="font-size:9px;color:var(--text3);background:var(--bg);padding:2px 6px;border-radius:4px;margin-left:6px;font-weight:bold;">● PAUSED</span>';

            return '<div class="my-ad-card">' +
              '<div class="my-ad-media">' +
                mediaHtml +
                '<span class="my-ad-tag-absolute ' + badgeClass + '">' + esc(ad.statusTag) + '</span>' +
              '</div>' +
              '<div class="my-ad-info">' +
                '<div class="my-ad-header">' +
                  '<div>' +
                    '<div class="my-ad-name" style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">' + esc(ad.name) + statusBadge + '</div>' +
                    '<div class="my-ad-id-txt">ID: ' + esc(ad.ad_id) + '</div>' +
                  '</div>' +
                '</div>' +
                (ad.body ? '<div class="my-ad-body-txt">' + esc(ad.body) + '</div>' : '') +
                '<div class="my-ad-stats">' +
                  '<div class="my-ad-stat-box"><div class="my-ad-stat-lbl">Spend</div><div class="my-ad-stat-val">' + formatCurrency(ad.spend) + '</div></div>' +
                  '<div class="my-ad-stat-box highlight"><div class="my-ad-stat-lbl">ROAS</div><div class="my-ad-stat-val">' + ad.roas.toFixed(2) + 'x</div></div>' +
                  '<div class="my-ad-stat-box"><div class="my-ad-stat-lbl">Purchases</div><div class="my-ad-stat-val">' + ad.purchases + '</div></div>' +
                '</div>' +
              '</div>' +
            '</div>';
          }).join('');
        }

        setTimeout(function() {
          renderMyAdsCharts(data);
        }, 80);

        try {
          var savedAI = localStorage.getItem('mai_meta_ai_analysis');
          if (savedAI) {
            document.getElementById('my-ads-ai-text').textContent = savedAI;
            document.getElementById('my-ads-ai-result').style.display = 'block';
            document.getElementById('my-ads-ai-btn').textContent = '🔄 অডিট আপডেট করুন';
          } else {
            document.getElementById('my-ads-ai-result').style.display = 'none';
            document.getElementById('my-ads-ai-btn').textContent = '✨ অডিট তৈরি করুন';
          }
        } catch (e) {}

        filterMyAdsDisplay();

        try {
          var debugEl = document.getElementById('my-ads-debug-json');
          if (debugEl) {
            debugEl.value = data.debug_creatives ? JSON.stringify(data.debug_creatives, null, 2) : 'No debug creatives data';
          }
        } catch (e) {}
      }

      function renderMyAdsCharts(data) {
        var labels = data.campaigns.map(function(c) { return c.name.length > 25 ? c.name.substring(0, 22) + '...' : c.name; });
        var spends = data.campaigns.map(function(c) { return c.spend; });
        var purchases = data.campaigns.map(function(c) { return c.purchases; });
        
        var ctxTrend = document.getElementById('myAdsTrendChart').getContext('2d');
        if (window.myAdsTrendChartInst) window.myAdsTrendChartInst.destroy();
        window.myAdsTrendChartInst = new Chart(ctxTrend, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Spend ($)',
                data: spends,
                backgroundColor: 'rgba(8, 102, 255, 0.85)',
                yAxisID: 'ySpend',
                borderWidth: 0,
                borderRadius: 4
              },
              {
                label: 'Purchases (Qty)',
                data: purchases,
                backgroundColor: 'rgba(49, 162, 76, 0.85)',
                yAxisID: 'yPurchases',
                borderWidth: 0,
                borderRadius: 4
              }
            ]
          },
          options: {
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: { font: { family: 'inherit', size: 11 } }
              }
            },
            scales: {
              x: { grid: { display: false } },
              ySpend: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'Spend ($)', font: { weight: 'bold' } },
                grid: { color: 'rgba(0,0,0,0.05)' }
              },
              yPurchases: {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'Purchases', font: { weight: 'bold' } },
                grid: { display: false }
              }
            }
          }
        });

        var adNames = data.ads.map(function(a) { return a.name.length > 20 ? a.name.substring(0, 17) + '...' : a.name; });
        var roas = data.ads.map(function(a) { return a.roas; });
        var ctrs = data.ads.map(function(a) { return a.ctr; });

        var ctxRoasCtr = document.getElementById('myAdsRoasCtrChart').getContext('2d');
        if (window.myAdsRoasCtrChartInst) window.myAdsRoasCtrChartInst.destroy();
        window.myAdsRoasCtrChartInst = new Chart(ctxRoasCtr, {
          type: 'line',
          data: {
            labels: adNames,
            datasets: [
              {
                label: 'ROAS (x)',
                data: roas,
                borderColor: 'rgba(139, 77, 255, 1)',
                backgroundColor: 'rgba(139, 77, 255, 0.1)',
                yAxisID: 'yRoas',
                tension: 0.3,
                fill: true
              },
              {
                label: 'CTR (%)',
                data: ctrs,
                borderColor: 'rgba(240, 163, 10, 1)',
                backgroundColor: 'transparent',
                yAxisID: 'yCtr',
                tension: 0.3,
                borderDash: [5, 5]
              }
            ]
          },
          options: {
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'top',
                labels: { font: { family: 'inherit', size: 11 } }
              }
            },
            scales: {
              x: { grid: { display: false } },
              yRoas: {
                type: 'linear',
                position: 'left',
                title: { display: true, text: 'ROAS (x)' },
                grid: { color: 'rgba(0,0,0,0.05)' }
              },
              yCtr: {
                type: 'linear',
                position: 'right',
                title: { display: true, text: 'CTR (%)' },
                grid: { display: false }
              }
            }
          }
        });
      }

      async function runMyAdsAIAnalysis() {
        if (!keys.c) {
          alert('Claude API Key সেট করা নেই! দয়া করে API Keys সেট করো বাটনে ক্লিক করে API Key দিন।');
          openModal();
          return;
        }

        if (!myAdsData) {
          alert('কোনো অ্যাড অ্যাকাউন্ট ডেটা লোড করা নেই।');
          return;
        }

        var btn = document.getElementById('my-ads-ai-btn');
        var load = document.getElementById('my-ads-ai-loading');
        var res = document.getElementById('my-ads-ai-result');
        var txt = document.getElementById('my-ads-ai-text');

        btn.style.display = 'none';
        load.style.display = 'block';
        res.style.display = 'none';

        var prompt = 'You are an elite Meta Ads performance strategist. Analyze my ad account performance data for the last 30 days and write a detailed audit report in simple Bengali sentences to help me make scaling decisions.\n\n' +
          'SUMMARY STATS:\n' +
          '- Total Spend: $' + myAdsData.summary.spend.toFixed(2) + '\n' +
          '- Total Purchases: ' + myAdsData.summary.purchases + '\n' +
          '- Average ROAS: ' + myAdsData.summary.roas.toFixed(2) + 'x\n' +
          '- Average CTR: ' + myAdsData.summary.ctr.toFixed(2) + '%\n' +
          '- Average CPC: $' + myAdsData.summary.cpc.toFixed(2) + '\n' +
          '- Average CPA: $' + myAdsData.summary.cpa.toFixed(2) + '\n\n' +
          'CAMPAIGNS:\n' +
          JSON.stringify(myAdsData.campaigns.map(function(c) { return { name: c.name, spend: c.spend, purchases: c.purchases, roas: c.roas, cpa: c.cpa, ctr: c.ctr }; })) + '\n\n' +
          'ADS & CREATIVES PERFORMANCE:\n' +
          JSON.stringify(myAdsData.ads.map(function(a) { return { name: a.name, spend: a.spend, purchases: a.purchases, roas: a.roas, cpa: a.cpa, ctr: a.ctr, statusTag: a.statusTag, title: a.title, body: a.body }; })) + '\n\n' +
          'Write a beautiful audit containing:\n' +
          '1. **সামগ্রিক অ্যাকাউন্ট পারফরম্যান্স ওভারভিউ** (Overall assessment)\n' +
          '2. **কোন ক্যাম্পেইন/অ্যাড স্কেল করবেন এবং কীভাবে** (Scaling recommendations - budget changes)\n' +
          '3. **কোন ক্যাম্পেইন/অ্যাড পজ করবেন বা বন্ধ করবেন** (What to pause & why based on ROAS and Spend)\n' +
          '4. **ক্রিয়েটিভ ও কপি অপ্টিমাইজেশন পরামর্শ** (Creative & copy analysis based on CTR and messaging)\n' +
          '5. **তাত্ক্ষণিক অ্যাকশন লিস্ট** (Action items checklist)\n\n' +
          'Ensure the response is structured, clear, uses markdown bullet points, and is entirely in easy-to-read Bengali.';

        try {
          var r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': keys.c,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 3000,
              messages: [{ role: 'user', content: prompt }]
            })
          });

          if (!r.ok) {
            var e;
            try { e = await r.json(); } catch (x) { throw new Error('Claude API error'); }
            throw new Error((e.error && e.error.message) || 'Claude API error');
          }

          var d = await r.json();
          var raw = d.content && d.content.map(function (c) { return c.text || ''; }).join('') || '';
          
          txt.textContent = raw;
          
          try {
            localStorage.setItem('mai_meta_ai_analysis', raw);
          } catch(e) {}

          load.style.display = 'none';
          res.style.display = 'block';
          btn.style.display = 'inline-block';
          btn.textContent = '🔄 অডিট আপডেট করুন';
        } catch (e) {
          load.style.display = 'none';
          btn.style.display = 'inline-block';
          alert('Claude API থেকে অডিট জেনারেট করতে সমস্যা হয়েছে: ' + e.message);
        }
      }
      window.runMyAdsAIAnalysis = runMyAdsAIAnalysis;

      // Check saved Meta account
      try {
        var mToken = localStorage.getItem('mai_meta_token');
        var mAccount = localStorage.getItem('mai_meta_account_id');
        var mSavedData = localStorage.getItem('mai_meta_saved_search');
        
        if (mToken) document.getElementById('meta-token').value = mToken;
        if (mAccount) document.getElementById('meta-account-id').value = mAccount;
        
        if (mSavedData) {
          myAdsData = JSON.parse(mSavedData);
          renderMyAdsDashboard(myAdsData);
        }
      } catch (e) {}

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
            <div className="top-tabs" id="main-tabs">
              <button className="top-tab active" id="tab-competitor" onClick={() => window.switchMainTab && window.switchMainTab('competitor')}>🔍 Competitor Intelligence</button>
              <button className="top-tab" id="tab-myads" onClick={() => window.switchMainTab && window.switchMainTab('myads')}>📊 My Ads Dashboard</button>
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

        {/* MY ADS SECTION */}
        <div id="my-ads-section" style={{ display: 'none' }}>
          {/* Connection View */}
          <div className="conn-card" id="my-ads-conn-card">
            <div className="conn-title">📊 কানেক্ট করুন আপনার Meta Ads Account</div>
            <div className="conn-sub">আপনার রানিং ক্যাম্পেইনের রিপোর্ট ভিজ্যুয়ালি অ্যানালাইজ করুন এবং এআই এর মাধ্যমে স্কেলিং সিদ্ধান্ত নিন।</div>
            <div className="conn-form">
              <div className="conn-field">
                <label>Meta Access Token <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noreferrer">(Token কীভাবে পাবেন? ↗)</a></label>
                <input type="password" id="meta-token" placeholder="EAABw..." className="sinp" style={{ width: '100%' }} />
              </div>
              <div className="conn-field">
                <label>Meta Ad Account ID</label>
                <input type="text" id="meta-account-id" placeholder="act_123456789" className="sinp" style={{ width: '100%' }} />
              </div>
              <div className="conn-btn-group">
                <button className="go-btn" onClick={() => window.connectMetaAds && window.connectMetaAds(false)}>🔌 লাইভ কানেক্ট করুন</button>
                <button className="conn-btn-demo" onClick={() => window.connectMetaAds && window.connectMetaAds(true)}>✨ ডেমো অ্যাকাউন্ট দিয়ে চেষ্টা করুন</button>
              </div>
              <div className="help-tooltip" style={{ marginTop: 10 }}>
                🔒 <strong>নিরাপত্তা নোটিশ:</strong> আপনার Meta Access Token এবং Account ID শুধুমাত্র আপনার ব্রাউজারেই সংরক্ষিত থাকবে (localStorage)। কোনো থার্ড-পার্টি সার্ভারে ডেটা পাঠানো হয় না।
              </div>
            </div>
          </div>

          {/* Active Connection details */}
          <div className="account-banner" id="my-ads-account-banner" style={{ display: 'none', flexWrap: 'wrap', gap: 16 }}>
            <div className="account-details">
              <div className="account-avatar" id="my-ads-avatar">M</div>
              <div className="account-info-text">
                <div className="account-title-name" id="my-ads-account-name">Meta Ad Account</div>
                <div className="account-id-label" id="my-ads-account-id-label">act_00000</div>
              </div>
            </div>

            {/* Filters Row */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }} id="my-ads-filters-container">
              <div className="custom-datepicker" style={{ position: 'relative', display: 'inline-block' }} id="my-ads-datepicker-wrapper">
                <button 
                  id="my-ads-date-btn" 
                  onClick={() => window.toggleDatePicker && window.toggleDatePicker()} 
                  style={{ 
                    padding: '6px 12px', 
                    fontSize: 13, 
                    background: 'var(--white)', 
                    border: '1px solid var(--border)', 
                    borderRadius: 4, 
                    cursor: 'pointer', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6,
                    color: 'var(--text)',
                    fontWeight: 500,
                    minWidth: 160
                  }}
                >
                  📅 <span id="my-ads-date-btn-label">Last 30 Days (গত ৩০ দিন)</span>
                </button>
                <div 
                  id="my-ads-date-picker-dropdown" 
                  className="datepicker-dropdown" 
                  style={{ 
                    display: 'none', 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    zIndex: 1000, 
                    background: 'var(--white)', 
                    border: '1px solid var(--border)', 
                    borderRadius: 6, 
                    boxShadow: 'var(--shadow)', 
                    padding: 14, 
                    minWidth: 280, 
                    marginTop: 6,
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('today', 'Today (আজ)')}>আজ (Today)</button>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('yesterday', 'Yesterday (গতকাল)')}>গতকাল (Yesterday)</button>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('last_3d', 'Last 3 Days (গত ৩ দিন)')}>গত ৩ দিন</button>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('last_5d', 'Last 5 Days (গত ৫ দিন)')}>গত ৫ দিন</button>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('last_7d', 'Last 7 Days (গত ৭ দিন)')}>গত ৭ দিন</button>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('last_10d', 'Last 10 Days (গত ১০ দিন)')}>গত ১০ দিন</button>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('last_14d', 'Last 14 Days (গত ১৪ দিন)')}>গত ১৪ দিন</button>
                    <button className="preset-btn" onClick={() => window.selectDatePreset && window.selectDatePreset('last_30d', 'Last 30 Days (গত ৩০ দিন)')}>গত ৩০ দিন</button>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>📅 কাস্টম ক্যালেন্ডার রেঞ্জ:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 2 }}>শুরুর তারিখ (Start Date):</label>
                        <input type="date" id="my-ads-start-date" className="sinp" style={{ fontSize: 12, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 10, color: 'var(--text2)', display: 'block', marginBottom: 2 }}>শেষের তারিখ (End Date):</label>
                        <input type="date" id="my-ads-end-date" className="sinp" style={{ fontSize: 12, padding: '4px 8px', width: '100%', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <button className="go-btn" style={{ padding: '6px 10px', fontSize: 12, width: '100%', fontWeight: 600 }} onClick={() => window.applyCustomCalendarRange && window.applyCustomCalendarRange()}>প্রয়োগ করুন (Apply)</button>
                  </div>
                </div>
              </div>
              <select id="my-ads-campaign-filter" style={{ minWidth: 150, maxWidth: 220, padding: '6px 10px', fontSize: 13 }} onChange={() => window.filterMyAdsDisplay && window.filterMyAdsDisplay()}>
                <option value="ALL">All Campaigns (সব ক্যাম্পেইন)</option>
              </select>
              <select id="my-ads-status-filter" style={{ minWidth: 130, padding: '6px 10px', fontSize: 13 }} onChange={() => window.filterMyAdsDisplay && window.filterMyAdsDisplay()}>
                <option value="ALL">All Ads (সব অ্যাড)</option>
                <option value="ACTIVE">Active Only (চালু অ্যাড)</option>
                <option value="PAUSED">Paused Only (বন্ধ অ্যাড)</option>
              </select>
            </div>

            <button className="account-disc-btn" onClick={() => window.disconnectMetaAds && window.disconnectMetaAds()}>Disconnect Account</button>
          </div>

          {/* Loading for My Ads */}
          <div className="loading" id="my-ads-loading" style={{ display: 'none' }}>
            <div className="spinner"></div>
            <div className="loading-txt" id="my-ads-ltxt">Meta API থেকে ডেটা লোড করা হচ্ছে...</div>
            <div className="loading-sub" id="my-ads-lsub">অনুগ্রহ করে অপেক্ষা করুন</div>
          </div>

          {/* Error Box for My Ads */}
          <div className="errbox" id="my-ads-errbox" style={{ display: 'none' }}></div>

          {/* My Ads Dashboard Content */}
          <div className="dashboard" id="my-ads-dashboard" style={{ display: 'none' }}>
            <div className="dash-layout">
              <div className="dash-content">
                
                {/* KPI Stats */}
                <div className="stat-row" id="my-ads-stat-row"></div>

                {/* Campaign Detail Audit Card */}
                <div id="my-ads-campaign-detail-card" style={{ display: 'none' }}></div>

                {/* Charts */}
                <div className="section-grid">
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Campaign Spend vs. Purchases (পারফরম্যান্স ট্রেন্ড)</span>
                      <span className="card-badge badge-blue">Performance</span>
                    </div>
                    <div style={{ height: 260, width: '100%', position: 'relative' }}>
                      <canvas id="myAdsTrendChart"></canvas>
                    </div>
                  </div>
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">ROAS vs CTR কম্পারিজন</span>
                      <span className="card-badge badge-purple">Metrics Match</span>
                    </div>
                    <div style={{ height: 260, width: '100%', position: 'relative' }}>
                      <canvas id="myAdsRoasCtrChart"></canvas>
                    </div>
                  </div>
                </div>

                {/* AI Strategist Decision Maker */}
                <div className="section-full">
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">🤖 AI Strategist — ক্যাম্পেইন অডিট ও স্কেলিং সিদ্ধান্ত</span>
                      <span className="card-badge badge-green">Decision Maker</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>
                      আপনার রানিং অ্যাড অ্যাকাউন্ট ডেটার উপর ভিত্তি করে ক্লাউড এআই দিয়ে একটি পূর্ণাঙ্গ ক্যাম্পেইন অডিট করুন। কোন অ্যাড পজ করা উচিত, কোনটিতে বাজেট বাড়ানো উচিত, সব সিদ্ধান্ত এক ক্লিকে।
                    </p>
                    <button className="go-btn" id="my-ads-ai-btn" onClick={() => window.runMyAdsAIAnalysis && window.runMyAdsAIAnalysis()}>✨ এআই অডিট তৈরি করুন</button>
                    
                    <div id="my-ads-ai-loading" style={{ display: 'none', marginTop: 14, fontSize: 13, color: 'var(--text3)' }}>
                      <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2, margin: '0 10px 0 0', display: 'inline-block', verticalAlign: 'middle' }}></div>
                      এআই অ্যাকাউন্ট অডিট করছে, ৩-৫ সেকেন্ড সময় লাগতে পারে...
                    </div>
                    <div id="my-ads-ai-result" className="ai-insight" style={{ display: 'none', marginTop: 16 }}>
                      <div className="ai-insight-label">Claude AI Strategist Recommendation</div>
                      <div className="ai-insight-text" id="my-ads-ai-text" style={{ whiteSpace: 'pre-wrap' }}></div>
                    </div>
                  </div>
                </div>

                {/* Ads Creative Grid */}
                <div className="section-full">
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">অ্যাকটিভ Ads ও ক্রিয়েটিভ পারফরম্যান্স विश्लेषण</span>
                      <span className="card-badge badge-accent">Creative Performance</span>
                    </div>
                    <div className="my-ads-grid" id="my-ads-creatives-grid"></div>
                    <details style={{ marginTop: 20, border: '1px solid var(--border)', borderRadius: 'var(--rs)', padding: '10px 14px', background: 'var(--bg)' }}>
                      <summary style={{ fontWeight: 'bold', cursor: 'pointer', fontSize: 13, color: 'var(--text2)' }}>🔧 Developer Debug Console (Raw API Creatives)</summary>
                      <textarea id="my-ads-debug-json" readOnly style={{ width: '100%', height: '300px', marginTop: 10, fontFamily: 'monospace', fontSize: 11, background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 4, padding: 8, color: 'var(--text2)', resize: 'vertical' }} defaultValue="No debug data loaded yet. Connect your account to see raw Graph API response."></textarea>
                    </details>
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
