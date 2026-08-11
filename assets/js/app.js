(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const el = (t, c, txt) => { const n = document.createElement(t); if (c) n.className = c; if (txt != null) n.textContent = txt; return n; };
  const esc = s => s.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
  const slug = w => w.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  let DATA = null, cur = 1, curSeason = 1, audio = null, mode = 'novel';

  /* 当前模式下使用的词表 */
  function activeVocab(ep) {
    return mode === 'script' ? (ep.scriptVocab || []) : ep.vocab;
  }

  /* localStorage 在 file:// 下某些平板浏览器会抛错，这里统一包一层 */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 忽略 */ } },
  };

  /* ---------------- 发音：本地 Google TTS(en-GB) 优先，失败回退浏览器语音 ---------------- */
  function speak(word, btn) {
    if (audio) { audio.pause(); audio = null; }
    document.querySelectorAll('.v-play.playing').forEach(b => b.classList.remove('playing'));
    btn && btn.classList.add('playing');
    const done = () => btn && btn.classList.remove('playing');

    const a = new Audio(`assets/tts/${slug(word)}.mp3`);
    audio = a;
    a.onended = done;
    a.onerror = () => {
      done();
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(word);
      u.lang = 'en-GB'; u.rate = .85;
      const v = speechSynthesis.getVoices().find(x => /en[-_]GB/i.test(x.lang));
      if (v) u.voice = v;
      btn && btn.classList.add('playing');
      u.onend = done;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    };
    a.play().catch(() => a.onerror());
  }

  /* ---------------- 渲染小说：[[surface|headword]] ---------------- */
  function renderNovel(ep) {
    const wrap = $('#novel');
    wrap.innerHTML = '';
    const idxOf = {};
    ep.vocab.forEach((v, i) => idxOf[v.w] = i + 1);

    ep.novel.split(/\n\s*\n/).forEach(para => {
      const p = el('p');
      const re = /\[\[([^\]|]+)\|([^\]]+)\]\]/g;
      let last = 0, m;
      while ((m = re.exec(para)) !== null) {
        if (m.index > last) p.append(document.createTextNode(para.slice(last, m.index)));
        const mk = el('mark', 'vw', m[1]);
        mk.dataset.w = m[2];
        const sup = el('sup', null, String(idxOf[m[2]] ?? ''));
        mk.append(sup);
        mk.title = '查看词条';
        p.append(mk);
        last = re.lastIndex;
      }
      if (last < para.length) p.append(document.createTextNode(para.slice(last)));
      wrap.append(p);
    });
  }

  /* ---------------- 在文本中高亮一套词表（接受 vocab 数组，不缓存到 ep） ---------------- */
  function highlight(text, vocab) {
    if (!vocab || !vocab.length) return esc(text);
    const terms = vocab.map(v => v.w.toLowerCase()).sort((a, b) => b.length - a.length);
    const pat = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp('\\b(' + pat + ')\\b', 'gi');
    const hlMap = {};
    vocab.forEach((v, i) => { hlMap[v.w.toLowerCase()] = { w: v.w, i: i + 1 }; });
    const escText = esc(text);
    let out = '', last = 0, m;
    re.lastIndex = 0;
    while ((m = re.exec(escText)) !== null) {
      const info = hlMap[m[0].toLowerCase()];
      if (!info) continue;
      out += escText.slice(last, m.index);
      out += `<mark class="vw" data-w="${esc(info.w)}" data-i="${info.i}">${m[0]}<sup>${info.i}</sup></mark>`;
      last = re.lastIndex;
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    out += escText.slice(last);
    return out;
  }

  function renderScript(ep) {
    const wrap = $('#novel');
    wrap.innerHTML = '';
    const lines = (ep.script || '').split(/\r?\n/);
    const spk = /^([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+)*):\s?(.*)$/;
    const voc = activeVocab(ep);
    lines.forEach(line => {
      const raw = line.replace(/\s+$/, '');
      if (!raw.trim()) return;
      if (raw.startsWith('[')) {
        const p = el('p', 'stage'); p.innerHTML = highlight(raw, voc); wrap.append(p); return;
      }
      const sm = raw.match(spk);
      if (sm) {
        const p = el('p', 'dlg');
        p.append(el('span', 'spk', sm[1]));
        const t = el('span', 'line'); t.innerHTML = highlight(sm[2], voc); p.append(t);
        wrap.append(p); return;
      }
      const p = el('p', 'scene-h'); p.innerHTML = highlight(raw, voc); wrap.append(p);
    });
  }

  function renderLeft(ep) {
    const art = $('#novel');
    if (mode === 'script') {
      art.className = 'novel script-view';
      renderScript(ep);
    } else {
      art.className = 'novel';
      renderNovel(ep);
    }
    art.scrollTop = 0;
  }

  function updateMeta(ep) {
    const vLen = activeVocab(ep).length;
    if (mode === 'script') {
      const w = ep.script ? ep.script.split(/\s+/).filter(Boolean).length : 0;
      $('#epMeta').textContent = `原剧台本 · ${w} words · ${vLen} 个生词`;
    } else {
      const w = ep.novel.replace(/\[\[([^\]|]+)\|[^\]]+\]\]/g, '$1').split(/\s+/).length;
      $('#epMeta').textContent = `${w} words · ${vLen} 个生词 · 约 ${Math.max(1, Math.round(w / 90))} 分钟`;
    }
  }

  /* ---------------- 渲染词汇表 ---------------- */
  function renderVocab(ep) {
    const box = $('#vocab');
    box.innerHTML = '';
    const voc = activeVocab(ep);
    $('#vocabCount').textContent = voc.length;

    voc.forEach((v, i) => {
      const card = el('div', 'v-card');
      card.id = 'card-' + slug(v.w);
      card.dataset.key = (v.w + ' ' + (v.cn || '')).toLowerCase();

      const top = el('div', 'v-top');
      top.append(el('span', 'v-idx', String(i + 1)));
      const w = el('span', 'v-word', v.w);
      w.title = '在小说中定位';
      w.addEventListener('click', () => focusWord(v.w));
      top.append(w);
      if (v.pos) top.append(el('span', 'v-pos', v.pos));
      if (v.ipa) top.append(el('span', 'v-ipa', v.ipa));
      const play = el('button', 'v-play', '▶');
      play.title = 'Google TTS 英式发音';
      play.addEventListener('click', () => speak(v.w, play));
      top.append(play);
      card.append(top);

      card.append(el('p', 'v-cn', v.cn));
      const en = el('p', 'v-en');
      en.innerHTML = '<b>EN</b> ' + esc(v.en);
      card.append(en);
      if (v.eg) card.append(el('p', 'v-eg', '“' + v.eg + '”'));

      const d = el('details', 'v-ety');
      d.append(el('summary', null, 'Etymology · etymonline 原文'));
      const body = el('div', 'ety-body');
      if (v.ety && v.ety.text) {
        body.innerHTML =
          `<div class="ety-head">${esc(v.ety.head || v.w)}</div>${esc(v.ety.text)}` +
          `<span class="ety-src"><a href="${v.ety.url}" target="_blank" rel="noopener">etymonline.com ↗</a></span>`;
      } else {
        body.innerHTML = `<span class="ety-none">etymonline 没有该词条（多为短语/派生形式），可查词根：</span>` +
          `<span class="ety-src"><a href="https://www.etymonline.com/search?q=${encodeURIComponent(v.w)}" target="_blank" rel="noopener">在 etymonline 搜索 ↗</a></span>`;
      }
      d.append(body);
      card.append(d);
      box.append(card);
    });
  }

  function focusCard(word) {
    const c = document.getElementById('card-' + slug(word));
    if (!c) return;
    c.scrollIntoView({ behavior: 'smooth', block: 'center' });
    c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
    setTimeout(() => c.classList.remove('flash'), 1600);
  }
  function focusWord(word) {
    const m = document.querySelector(`mark.vw[data-w="${CSS.escape(word)}"]`);
    if (!m) return;
    m.scrollIntoView({ behavior: 'smooth', block: 'center' });
    m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash');
    setTimeout(() => m.classList.remove('flash'), 1600);
  }

  /* ---------------- 切集 ---------------- */
  function load(absId) {
    const ep = DATA.episodes.find(e => e.absId === absId);
    if (!ep) return;
    cur = absId;
    curSeason = ep.season;
    $('#epNum').textContent = ep.absId;
    $('#epTitle').textContent = ep.title;
    $('#epCn').textContent = ep.cn;
    $('#epLabel').textContent = ep.label;
    renderLeft(ep); renderVocab(ep); updateMeta(ep); renderCourse(ep);
    $('#search').value = '';
    document.querySelectorAll('#epList li[data-id]').forEach(li => li.classList.toggle('active', +li.dataset.id === absId));
    // 更新季选择器
    const selEl = $('#seasonSelect');
    if (selEl) selEl.value = ep.season;
    $('.novel-pane').scrollTop = 0; $('.vocab-pane').scrollTop = 0; window.scrollTo(0, 0);
    history.replaceState(null, '', '#' + ep.label);
    store.set('himym-ep', absId);
    store.set('himym-season', ep.season);
  }

  function buildList() {
    const ul = $('#epList');
    ul.innerHTML = '';
    (DATA.seasons || []).forEach(season => {
      // 季标题
      const sHdr = el('li', 'season-header');
      sHdr.innerHTML = '<span class="sh-dot">S' + season.season + '</span><span class="sh-title">' + season.title + '</span><span class="sh-count">' + season.episodes.length + ' 集</span>';
      ul.append(sHdr);
      // 该季的剧集
      season.episodes.forEach(e => {
        const li = el('li'); li.dataset.id = e.absId;
        li.append(el('span', 'li-n', e.label));
        li.append(el('span', 'li-t', e.title));
        li.append(el('span', 'li-cn', (e.vocab || []).length + ' 词'));
        li.addEventListener('click', () => { load(e.absId); closeDrawer(); });
        ul.append(li);
      });
    });
  }

  const openDrawer = () => { $('#drawer').hidden = false; $('#scrim').hidden = false; };
  const closeDrawer = () => { $('#drawer').hidden = true; $('#scrim').hidden = true; };

  function bind() {
    $('#btnEpisodes').onclick = openDrawer;
    $('#btnCloseDrawer').onclick = closeDrawer;
    $('#scrim').onclick = closeDrawer;
    const prev = () => { const allIds = DATA.episodes.map(e => e.absId).sort((a,b) => a-b); const i = allIds.indexOf(cur); if (i > 0) load(allIds[i-1]); };
    const next = () => { const allIds = DATA.episodes.map(e => e.absId).sort((a,b) => a-b); const i = allIds.indexOf(cur); if (i < allIds.length-1) load(allIds[i+1]); };
    $('#btnPrev').onclick = $('#btnPrev2').onclick = prev;
    $('#btnNext').onclick = $('#btnNext2').onclick = next;

    $('#tglMark').onchange = e => document.body.classList.toggle('no-mark', !e.target.checked);
    $('#tglCn').onchange = e => document.body.classList.toggle('no-cn', !e.target.checked);

    // 左侧正文里的生词点击 -> 右侧定位（小说与台本通用，事件委托）
    $('#novel').addEventListener('click', e => {
      const m = e.target.closest('mark.vw');
      if (m) focusCard(m.dataset.w);
    });

    // 小说 / 台本 切换
    document.querySelectorAll('#modeSeg .seg-btn').forEach(b => {
      b.onclick = () => {
        const m = b.dataset.mode;
        if (m === mode) return;
        mode = m;
        document.querySelectorAll('#modeSeg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
        const ep = DATA.episodes.find(e => e.absId === cur);
        if (ep) { renderLeft(ep); renderVocab(ep); updateMeta(ep); }
      };
    });

    $('#btnTheme').onclick = () => {
      const d = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = d;
      store.set('himym-theme', d);
    };

    $('#search').oninput = e => {
      const q = e.target.value.trim().toLowerCase();
      document.querySelectorAll('.v-card').forEach(c => {
        c.style.display = !q || c.dataset.key.includes(q) ? '' : 'none';
      });
    };

    document.addEventListener('keydown', e => {
      if (/input|textarea/i.test(e.target.tagName)) return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'Escape') closeDrawer();
    });

    // 季选择器
    $('#seasonSelect').onchange = function() {
      const s = +this.value;
      const season = (DATA.seasons || []).find(x => x.season === s);
      if (season && season.episodes.length) {
        load(season.episodes[0].absId);
      }
    };

    // === 课本 Tab 切换 ===
    // 注意：.layout{display:grid} 高于原生 [hidden]，故用 !important 加固，
    //       但 !important 又高于 style.display，所以显示面板时务必移除 hidden 属性。
    $('#tabBar').addEventListener('click', e => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      const t = btn.dataset.tab;
      document.querySelectorAll('#tabBar .tab').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach(p => {
        if (p.id === 'tab-' + t) {
          p.removeAttribute('hidden');   // 移除 hidden，让 !important 放行
          p.style.display = '';
        } else {
          p.hidden = true;               // 触发 !important 规则（覆盖 .layout 的 grid）
          p.style.display = 'none';
        }
      });
    });
  }

  /* ========== 课程内容渲染 ========== */
  function renderWarmup(ep) {
    const box = $('#warmupBox');
    const c = ep.course || {};
    const w = c.warmup;
    if (!w || !w.intro) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="warmup-intro">' + esc(w.intro) + '</div>' +
      (w.questions || []).map(q => '<div class="warmup-q">💭 ' + esc(q) + '</div>').join('');
  }

  function renderGrammar(ep) {
    const c = ep.course || {};
    const grams = c.grammar || [];
    if (!grams.length) { $('#grammarContent').innerHTML = '<p class="empty">本课暂无语法点。</p>'; return; }
    $('#grammarContent').innerHTML = grams.map((g, i) =>
      '<div class="grammar-block">' +
      '<h3 class="grammar-title">语法 ' + (i+1) + '：' + esc(g.title) + '</h3>' +
      '<p class="grammar-expl">' + g.explanation + '</p>' +
      '<div class="grammar-examples">' +
      (g.examples || []).map(ex => '<p class="grammar-ex">' + ex + '</p>').join('') +
      '</div></div>'
    ).join('');
  }

  function renderExercise(ep) {
    const c = ep.course || {};
    const exs = c.exercises || [];
    if (!exs.length) { $('#exerciseContent').innerHTML = '<p class="empty">暂无练习。</p>'; return; }
    var html = '';
    exs.forEach((ex, i) => {
      html += '<div class="ex-section"><h3 class="ex-head"><span class="ex-tag">Exercise ' + (i+1) + '</span> ' + esc(ex.title) + '</h3>';
      html += '<p class="ex-instr">' + esc(ex.instruction) + '</p>';

      if (ex.type === 'copywork') {
        // === 抄写练习 ===
        html += '<div class="ex-copywork">';
        if (ex.words && ex.words.length) {
          html += '<table class="cw-table"><thead><tr><th>Word</th><th>Write 3 times</th></tr></thead><tbody>';
          ex.words.forEach(w => {
            html += '<tr><td class="cw-word">' + esc(w) + '</td>';
            html += '<td class="cw-lines"><span class="cw-line"></span><span class="cw-line"></span><span class="cw-line"></span></td></tr>';
          });
          html += '</tbody></table>';
        }
        if (ex.sentence) {
          html += '<div class="cw-sentence"><strong>Copy this sentence:</strong><blockquote>' + esc(ex.sentence) + '</blockquote>';
          for (var k = 0; k < 2; k++) html += '<div class="cw-sent-line"></div>';
          html += '</div>';
        }
        html += '</div>';
      } else if (ex.type === 'wordbank-fill') {
        // === 词库填空 ===
        html += '<div class="ex-wb">';
        html += '<div class="wb-bank"><strong>Word Bank:</strong> ';
        var bank = ex.wordbank || [];
        bank.forEach(w => {
          html += '<span class="wb-chip" data-ex="' + i + '">' + esc(w) + '</span> ';
        });
        html += '</div>';
        html += '<ol class="wb-list">';
        (ex.sentences || []).forEach((s, j) => {
          html += '<li class="wb-item"><span class="wb-num">' + (j+1) + '.</span> ';
          html += '<span class="wb-text">' + esc(s.text) + '</span>';
          html += '<span class="wb-answer" style="display:none">' + esc(s.answer) + '</span>';
          html += '</li>';
        });
        html += '</ol></div>';
      } else if (ex.type === 'grammar-drill') {
        // === 语法填空 ===
        html += '<div class="ex-grammar">';
        (ex.items || []).forEach((item, j) => {
          html += '<div class="gm-item">';
          html += '<span class="gm-num">' + (j+1) + '.</span> ';
          html += '<span class="gm-context">' + esc(item.text) + '</span><br>';
          html += '<span class="gm-verb-hint"><em>' + esc(item.verb) + '</em> (base form) → </span>';
          html += '<input class="gm-input" data-ex="' + i + '" data-idx="' + j + '" placeholder="past tense...">';
          html += '</div>';
        });
        html += '</div>';
      } else if (ex.type === 'reading-qa') {
        // === 阅读理解简答 ===
        html += '<div class="ex-reading">';
        (ex.questions || []).forEach((qo, j) => {
          html += '<div class="rq-item">';
          html += '<span class="rq-num">Q' + (j+1) + '.</span> ';
          html += '<span class="rq-q">' + esc(qo.question) + '</span>';
          html += '<textarea class="rq-input" placeholder="Write your answer in complete sentences..." data-ex="' + i + '" data-idx="' + j + '" rows="3"></textarea>';
          html += '<div class="rq-hint" style="display:none">' + esc(qo.hint || '') + '</div>';
          html += '</div>';
        });
        html += '</div>';
      } else if (ex.type === 'sentence-write') {
        // === 造句 ===
        html += '<div class="ex-sentence">';
        (ex.words || []).forEach((w, j) => {
          html += '<div class="sw-item"><span class="sw-word">' + esc(w) + '</span>';
          html += '<textarea class="sw-input" placeholder="Write a complete sentence using \u201C' + esc(w) + '\u201D..." rows="2"></textarea>';
          html += '<div class="sw-hint" style="display:none">' + esc((ex.examples && ex.examples[j]) || '') + '</div>';
          html += '</div>';
        });
        html += '</div>';
      } else if (ex.type === 'vocab-spelling') {
        // === 单词拼写 ===
        html += '<div class="ex-vocab-spell">';
        (ex.words || []).forEach((w, j) => {
          html += '<div class="vs-item">';
          html += '<span class="vs-num">' + (j+1) + '.</span> ';
          html += '<span class="vs-cn">' + esc(w.cn) + '</span>';
          html += '<input class="vs-input" data-ex="' + i + '" data-idx="' + j + '" placeholder="type the English word...">';
          html += '<span class="vs-hint" style="display:none;font-size:12px;color:#888;margin-left:6px;">Hint: ' + esc(w.hint || '') + '</span>';
          html += '<span class="vs-answer" style="display:none">' + esc(w.answer) + '</span>';
          html += '</div>';
        });
        html += '</div>';
      } else if (ex.type === 'translation') {
        // === 中译英 ===
        html += '<div class="ex-translate">';
        (ex.items || []).forEach((item, j) => {
          html += '<div class="tl-item">';
          html += '<span class="tl-num">' + (j+1) + '.</span> ';
          html += '<div class="tl-cn">' + esc(item.cn) + '</div>';
          if (item.keywords && item.keywords.length) {
            html += '<div class="tl-keywords"><em>Keywords: </em>';
            item.keywords.forEach(function(kw) { html += '<span class="tl-kw">' + esc(kw) + '</span> '; });
            html += '</div>';
          }
          html += '<textarea class="tl-input" data-ex="' + i + '" data-idx="' + j + '" rows="3" placeholder="Translate into English..."></textarea>';
          html += '<div class="tl-hint" style="display:none">' + esc(item.answer || '') + '</div>';
          html += '</div>';
        });
        html += '</div>';
      } else if (ex.type === 'error-correction') {
        // === 改错 ===
        html += '<div class="ex-error-corr">';
        (ex.items || []).forEach((item, j) => {
          html += '<div class="ec-item">';
          html += '<span class="ec-num">' + (j+1) + '.</span> ';
          html += '<div class="ec-wrong"><span class="ec-label">\u2717 Wrong:</span> ' + esc(item.wrong) + '</div>';
          if (item.hint) html += '<div class="ec-hint-label"><em>\uD83D\uDCA1 ' + esc(item.hint) + '</em></div>';
          html += '<textarea class="ec-input" data-ex="' + i + '" data-idx="' + j + '" rows="2" placeholder="Write the corrected sentence..."></textarea>';
          html += '<div class="ec-answer" style="display:none">\u2713 ' + esc(item.answer || '') + '</div>';
          html += '</div>';
        });
        html += '</div>';
      } else if (ex.type === 'sentence-combine') {
        // === 连句 ===
        html += '<div class="ex-sent-combine">';
        (ex.items || []).forEach((item, j) => {
          html += '<div class="sc-item">';
          html += '<span class="sc-num">' + (j+1) + '.</span> ';
          html += '<div class="sc-sentences">';
          html += '<span class="sc-s1">' + esc(item.s1) + '</span>';
          html += '<span class="sc-plus"> + </span>';
          html += '<span class="sc-s2">' + esc(item.s2) + '</span>';
          html += '</div>';
          html += '<div class="sc-hint-label"><em>Use: ' + esc(item.hint || '') + '</em></div>';
          html += '<textarea class="sc-input" data-ex="' + i + '" data-idx="' + j + '" rows="2" placeholder="Combine into one sentence..."></textarea>';
          html += '<div class="sc-answer" style="display:none">' + esc(item.answer || '') + '</div>';
          html += '</div>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
    html += '<div class="ex-actions"><button class="btn primary" id="btnCheckEx">Check My Work</button><button class="btn" id="btnClearEx">Clear Answers</button></div>';
    $('#exerciseContent').innerHTML = html;

    // 词库chip点击：把词填入对应空格
    document.querySelectorAll('.wb-chip').forEach(chip => {
      chip.onclick = function() {
        // 在页面上高亮提示（词库填空是纸上作业，这里做不了自动填充，但可以高亮提示）
        chip.classList.toggle('wb-selected');
      };
    });

    // 检查按钮
    $('#btnCheckEx').onclick = function() {
      var score = 0, total = 0;
      // 语法填空
      document.querySelectorAll('.gm-input').forEach(function(inp) {
        var exIdx = +inp.dataset.ex, itemIdx = +inp.dataset.idx;
        var ans = '';
        try { ans = (exs[exIdx].items[itemIdx].answer || '').toLowerCase().trim(); } catch(e) {}
        var usr = inp.value.toLowerCase().trim();
        if (!ans) return;
        total++;
        // 显示正确答案
        var parent = inp.closest('.gm-item');
        var hintEl = parent.querySelector('.gm-hint');
        if (!hintEl) {
          hintEl = el('span', 'gm-hint');
          parent.appendChild(hintEl);
        }
        hintEl.textContent = ' → ' + ans;
        hintEl.style.display = '';
        if (usr === ans) { score++; inp.style.background = '#dcfce7'; inp.style.borderColor = '#16a34a'; }
        else { inp.style.background = '#fee2e2'; inp.style.borderColor = '#dc2626'; inp.title = 'Answer: ' + ans; }
      });
      // 单词拼写
      document.querySelectorAll('.vs-input').forEach(function(inp) {
        var exIdx = +inp.dataset.ex, itemIdx = +inp.dataset.idx;
        var ans = '';
        try { ans = (exs[exIdx].words[itemIdx].answer || '').toLowerCase().trim(); } catch(e) {}
        var usr = inp.value.toLowerCase().trim();
        if (!ans) return;
        total++;
        var parent = inp.closest('.vs-item');
        var hintEl = parent.querySelector('.vs-hint');
        var ansEl = parent.querySelector('.vs-answer');
        if (hintEl) hintEl.style.display = '';
        if (ansEl) ansEl.style.display = '';
        if (usr === ans) { score++; inp.style.background = '#dcfce7'; inp.style.borderColor = '#16a34a'; }
        else { inp.style.background = '#fee2e2'; inp.style.borderColor = '#dc2626'; }
      });
      // 改错
      document.querySelectorAll('.ec-input').forEach(function(ta) {
        var exIdx = +ta.dataset.ex, itemIdx = +ta.dataset.idx;
        var ans = '';
        try { ans = (exs[exIdx].items[itemIdx].answer || ''); } catch(e) {}
        if (!ans) return;
        total++;
        var parent = ta.closest('.ec-item');
        var ansEl = parent.querySelector('.ec-answer');
        if (ansEl) ansEl.style.display = '';
      });
      // 词库填空：显示隐藏的答案
      document.querySelectorAll('.wb-answer').forEach(function(sp) { sp.style.display = ''; });
      // 阅读理解：显示 hint 参考答案
      document.querySelectorAll('.rq-hint').forEach(function(h) { h.style.display = ''; });
      // 造句：显示示例句
      document.querySelectorAll('.sw-hint').forEach(function(h) { h.style.display = ''; });
      // 中译英：显示参考答案
      document.querySelectorAll('.tl-hint').forEach(function(h) { h.style.display = ''; });
      // 连句：显示参考答案
      document.querySelectorAll('.sc-answer').forEach(function(h) { h.style.display = ''; });
      // 主观题写没写
      var hasWritten = false;
      document.querySelectorAll('.rq-input, .sw-input, .tl-input, .ec-input, .sc-input').forEach(function(ta) {
        if (ta.value.trim()) hasWritten = true;
      });
      if (total > 0) {
        alert('\u2714 ' + score + ' / ' + total + ' items correct.' + (hasWritten ? ' Review the reference answers for your writing exercises.' : ''));
      } else if (hasWritten) {
        alert('\u2714 Great effort! Compare your writing with the reference answers.');
      } else {
        alert('\uD83D\uDCDD Please complete the exercises, then click Check to see answers.');
      }
    };

    // 清空按钮
    $('#btnClearEx').onclick = function() {
      // 清空语法填空输入
      document.querySelectorAll('.gm-input').forEach(function(inp) {
        inp.value = ''; inp.style.background = ''; inp.style.borderColor = ''; inp.title = '';
      });
      // 隐藏语法答案提示
      document.querySelectorAll('.gm-hint').forEach(function(h) { h.style.display = 'none'; h.textContent = ''; });
      // 清空单词拼写
      document.querySelectorAll('.vs-input').forEach(function(inp) {
        inp.value = ''; inp.style.background = ''; inp.style.borderColor = '';
      });
      document.querySelectorAll('.vs-hint, .vs-answer').forEach(function(h) { h.style.display = 'none'; });
      // 隐藏词库填空答案
      document.querySelectorAll('.wb-answer').forEach(function(sp) { sp.style.display = 'none'; });
      // 取消词库chip选中
      document.querySelectorAll('.wb-chip').forEach(function(c) { c.classList.remove('wb-selected'); });
      // 隐藏阅读理解 hint
      document.querySelectorAll('.rq-hint').forEach(function(h) { h.style.display = 'none'; });
      // 隐藏造句示例
      document.querySelectorAll('.sw-hint').forEach(function(h) { h.style.display = 'none'; });
      // 隐藏中译英答案
      document.querySelectorAll('.tl-hint').forEach(function(h) { h.style.display = 'none'; });
      // 隐藏改错答案
      document.querySelectorAll('.ec-answer').forEach(function(h) { h.style.display = 'none'; });
      // 隐藏连句答案
      document.querySelectorAll('.sc-answer').forEach(function(h) { h.style.display = 'none'; });
      // 清空所有 textarea 和 input
      document.querySelectorAll('.rq-input, .sw-input, .tl-input, .ec-input, .sc-input, .vs-input, .gm-input').forEach(function(el) {
        el.value = '';
      });
    };
  }

  function renderQuiz(ep) {
    const c = ep.course || {};
    const qs = c.quiz || [];
    if (!qs.length) { $('#quizContent').innerHTML = '<p class="empty">暂无测验。</p>'; return; }
    $('#quizResult').hidden = true;
    let html = '';
    qs.forEach((q, i) => {
      html += '<div class="quiz-q"><h3>' + (i+1) + '. ' + esc(q.question) + '</h3>';
      q.options.forEach((opt, j) => {
        const letter = String.fromCharCode(65 + j);
        html += '<label class="quiz-opt"><input type="radio" name="q' + i + '" value="' + letter + '"> ' + esc(opt) + '</label>';
      });
      html += '</div>';
    });
    html += '<button class="btn primary" id="btnCheckQuiz">✅ 提交测验</button>';
    $('#quizContent').innerHTML = html;
    // 绑定提交
    $('#btnCheckQuiz').onclick = () => {
      let correct = 0, total = qs.length;
      qs.forEach((q, i) => {
        const sel = document.querySelector('input[name="q' + i + '"]:checked');
        const isOK = sel && sel.value === q.answer;
        if (isOK) correct++;
        const el = document.querySelector('#quizContent .quiz-q:nth-child(' + (i+1) + ')');
        if (el) el.innerHTML += '<p class="quiz-feedback ' + (isOK ? 'ok' : 'no') + '">' +
          (isOK ? '✅ 正确！' : '❌ 正确答案是：' + q.answer + ') ' + q.options[q.answer.charCodeAt(0)-65]) + '</p>';
      });
      $('#quizResult').hidden = false;
      $('#quizResult').innerHTML = '<strong>测验结果：</strong> ' + correct + ' / ' + total +
        (correct === total ? ' 🎉 完美！' : correct >= total*0.7 ? ' 👍 不错，继续加油！' : ' 📚 再复习一下吧！');
      $('#btnCheckQuiz').disabled = true;
    };
  }

  function renderCourse(ep) {
    renderWarmup(ep);
    renderGrammar(ep);
    renderExercise(ep);
    renderQuiz(ep);
  }

  // 数据已内联在 assets/js/data.js -> window.DATA，离线 / 双击打开均可使用
  function boot() {
    if (!window.DATA || !window.DATA.seasons || !window.DATA.seasons.length) {
      $('#loading').textContent = '数据未找到：请确保 assets/js/data.js 与本页面在同一目录。';
      return;
    }
    DATA = window.DATA;
    // 创建扁平剧集列表（按 absId 排序）
    DATA.episodes = DATA.seasons.flatMap(s => s.episodes).sort((a, b) => a.absId - b.absId);
    // 填充季选择器
    const ss = $('#seasonSelect');
    if (ss) {
      ss.innerHTML = '';
      DATA.seasons.forEach(s => {
        const opt = el('option');
        opt.value = s.season;
        opt.textContent = '第' + s.season + '季';
        ss.append(opt);
      });
    }
    document.documentElement.dataset.theme = store.get('himym-theme') || 'light';
    buildList(); bind();
    // 解析 URL hash: #S{season}EP{absId} 或旧的 #ep{id}
    let targetId = null;
    const hash = location.hash;
    const newMatch = hash.match(/S\d+EP(\d+)/);
    if (newMatch) {
      targetId = +newMatch[1];
    } else {
      const oldMatch = hash.match(/ep(\d+)/);
      if (oldMatch) targetId = +oldMatch[1];
    }
    load(targetId || +store.get('himym-ep') || 1);
    $('#loading').classList.add('hide');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
