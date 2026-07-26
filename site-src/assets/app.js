(() => {
  "use strict";

  const records = Array.isArray(window.KOFUN_DATA) ? window.KOFUN_DATA : [];
  const prefectures = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ];
  const genericDescription = "公開データに位置情報が登録されている古墳です。詳しい調査成果は出典リンクから確認できます。";

  const state = {
    query: "",
    prefecture: "",
    photoOnly: false,
    panoramaOnly: false,
    source: "",
    view: "map",
    cardLimit: 12,
    seed: 31
  };

  const dom = {
    heroForm: document.querySelector("#hero-search-form"),
    heroSearch: document.querySelector("#hero-search"),
    mapSearch: document.querySelector("#map-search"),
    prefecture: document.querySelector("#prefecture-filter"),
    photo: document.querySelector("#photo-filter"),
    panorama: document.querySelector("#panorama-filter"),
    reset: document.querySelector("#reset-filters"),
    count: document.querySelector("#result-count"),
    map: document.querySelector("#kofun-map"),
    list: document.querySelector("#kofun-list"),
    grid: document.querySelector("#featured-grid"),
    loadMore: document.querySelector("#load-more"),
    shuffle: document.querySelector("#shuffle-results"),
    today: document.querySelector("#today-card"),
    todayDate: document.querySelector("#today-date"),
    dialog: document.querySelector("#detail-dialog"),
    detail: document.querySelector("#detail-content"),
    startQuiz: document.querySelector("#start-quiz"),
    quizStage: document.querySelector("#quiz-stage")
  };

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");

  const escapeAttr = escapeHtml;

  function normalize(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ja")
      .replace(/[\s　・、。,.()（）ヶケ之ノ\-ー]/g, "");
  }

  function searchable(record) {
    if (!record._searchable) {
      record._searchable = normalize([
        record.name,
        record.reading,
        ...(record.aliases || []),
        record.prefecture,
        record.location,
        record.group,
        record.shape,
        record.period,
        record.description
      ].join(" "));
    }
    return record._searchable;
  }

  function hashNumber(text) {
    let hash = 2166136261;
    for (const char of String(text)) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededSort(items, seed) {
    return [...items].sort((a, b) =>
      hashNumber(`${a.id}-${seed}`) - hashNumber(`${b.id}-${seed}`)
    );
  }

  function filteredRecords() {
    const query = normalize(state.query);
    return records.filter(record =>
      (!query || searchable(record).includes(query))
      && (!state.prefecture || record.prefecture === state.prefecture)
      && (!state.photoOnly || record.hasImage)
      && (!state.panoramaOnly || record.isPanorama)
      && (!state.source || (record.sources || []).includes(state.source))
    );
  }

  function photoUrl(record) {
    return record.image?.previewUrl || "";
  }

  function imageMarkup(record, className = "") {
    const url = photoUrl(record);
    if (!url) return "";
    const alt = record.image?.alt || `${record.name}の写真`;
    return `<img class="${escapeAttr(className)}" src="${escapeAttr(url)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  }

  function locationLabel(record) {
    const parts = [record.prefecture, record.location]
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);
    return parts.join("・") || "所在地情報は出典を参照";
  }

  function sourceLabel(record) {
    if (record.isPanorama) return "Kofun360 / CC0";
    if (record.sources?.includes("wikidata")) return "Wikidata / CC0";
    return "オープンデータ";
  }

  function renderPrefectures() {
    const counts = new Map(prefectures.map(pref => [pref, 0]));
    for (const record of records) {
      if (counts.has(record.prefecture)) {
        counts.set(record.prefecture, counts.get(record.prefecture) + 1);
      }
    }
    dom.prefecture.insertAdjacentHTML("beforeend", prefectures.map(pref =>
      `<option value="${escapeAttr(pref)}">${escapeHtml(pref)}（${counts.get(pref)}）</option>`
    ).join(""));
  }

  function renderToday() {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const panoramaCandidates = records.filter(record =>
      record.isPanorama && record.image?.previewUrl?.startsWith("./")
    );
    const candidates = panoramaCandidates.length
      ? panoramaCandidates
      : records.filter(record => record.hasImage);
    const record = candidates[hashNumber(key) % Math.max(candidates.length, 1)];
    dom.todayDate.textContent = new Intl.DateTimeFormat("ja-JP", {
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(now);
    if (!record) return;

    const photo = dom.today.querySelector(".today-photo");
    photo.classList.remove("skeleton");
    photo.style.backgroundImage = `linear-gradient(to top, rgba(17,31,21,.18), transparent 45%), url("${photoUrl(record).replaceAll("\"", "%22")}")`;
    dom.today.querySelector("h2").textContent = record.name;
    dom.today.querySelector(".today-location").textContent = locationLabel(record);
    dom.today.querySelector(".today-description").textContent = record.description || genericDescription;
    dom.today.querySelector("button").onclick = () => openDetail(record);
  }

  let leafletMap;
  let markerLayer;
  let mapRenderer;

  function initializeMap() {
    if (!window.L || !dom.map) return;
    leafletMap = L.map(dom.map, {
      center: [36.1, 137.5],
      zoom: 5,
      minZoom: 4,
      maxZoom: 18,
      zoomControl: true,
      preferCanvas: true,
      maxBounds: [[20, 120], [48, 155]],
      maxBoundsViscosity: .5
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(leafletMap);
    mapRenderer = L.canvas({ padding: .5 });
    markerLayer = L.layerGroup().addTo(leafletMap);
  }

  function updateMarkers(items, fit = false) {
    if (!leafletMap || !markerLayer) return;
    markerLayer.clearLayers();
    const bounds = [];

    for (const record of items) {
      const marker = L.circleMarker([record.lat, record.lng], {
        renderer: mapRenderer,
        radius: record.isPanorama ? 5.5 : 4,
        weight: 1.5,
        color: "#fffdf7",
        fillColor: record.isPanorama ? "#bd8c42" : "#b34b35",
        fillOpacity: .84
      });
      marker.bindTooltip(escapeHtml(record.name), { direction: "top", opacity: .92 });
      marker.bindPopup(`
        <div class="map-popup">
          <b>${escapeHtml(record.name)}</b>
          <span>${escapeHtml(locationLabel(record))}</span>
          <button type="button" data-map-record="${escapeAttr(record.id)}">くわしく見る →</button>
        </div>
      `);
      marker.on("popupopen", event => {
        const button = event.popup.getElement()?.querySelector("[data-map-record]");
        if (button) button.onclick = () => openDetail(record);
      });
      marker.addTo(markerLayer);
      bounds.push([record.lat, record.lng]);
    }

    if (fit && bounds.length) {
      leafletMap.fitBounds(bounds, {
        padding: [35, 35],
        maxZoom: items.length === 1 ? 14 : 10,
        animate: true
      });
    }
  }

  function cardMarkup(record) {
    const image = imageMarkup(record);
    return `
      <article class="kofun-card" tabindex="0" role="button" data-record-id="${escapeAttr(record.id)}" aria-label="${escapeAttr(record.name)}の詳細を見る">
        <div class="card-image">
          ${image}
          ${record.isPanorama ? '<span class="photo-badge">360° PANORAMA</span>' : record.hasImage ? '<span class="photo-badge">PHOTO</span>' : ""}
        </div>
        <div class="card-body">
          <p class="card-kicker">${escapeHtml(locationLabel(record))}</p>
          <h4>${escapeHtml(record.name)}</h4>
          <p>${escapeHtml(record.description || genericDescription)}</p>
          <div class="card-footer">
            <span>${escapeHtml(record.shape || record.period || "古墳")}</span>
            <b>${escapeHtml(sourceLabel(record))}</b>
          </div>
        </div>
      </article>
    `;
  }

  function renderCards(items) {
    const ordered = seededSort(items, state.seed)
      .sort((a, b) => Number(b.hasImage) - Number(a.hasImage));
    const shown = ordered.slice(0, state.cardLimit);
    dom.grid.innerHTML = shown.length
      ? shown.map(cardMarkup).join("")
      : '<p class="empty-results">条件に合う古墳がありません。検索語や絞り込みを変えてみてください。</p>';
    dom.loadMore.hidden = shown.length >= ordered.length;
  }

  function renderList(items) {
    const limited = items.slice(0, 600);
    dom.list.innerHTML = limited.length
      ? limited.map(record => `
          <div class="list-row" tabindex="0" role="button" data-record-id="${escapeAttr(record.id)}">
            <div><b>${escapeHtml(record.name)}</b><small>${escapeHtml(locationLabel(record))}${record.shape ? ` ／ ${escapeHtml(record.shape)}` : ""}</small></div>
            <span>${record.hasImage ? "写真あり" : "詳細 →"}</span>
          </div>
        `).join("") + (items.length > limited.length ? `<p class="empty-results">一覧は先頭${limited.length}件まで表示しています。検索で絞り込むと目的の古墳を見つけやすくなります。</p>` : "")
      : '<p class="empty-results">条件に合う古墳がありません。</p>';
  }

  function renderAll({ fitMap = false } = {}) {
    const items = filteredRecords();
    dom.count.textContent = new Intl.NumberFormat("ja-JP").format(items.length);
    renderCards(items);
    renderList(items);
    updateMarkers(items, fitMap);
  }

  function setQuery(value, { fitMap = true } = {}) {
    state.query = value.trim();
    dom.heroSearch.value = state.query;
    dom.mapSearch.value = state.query;
    state.cardLimit = 12;
    renderAll({ fitMap });
  }

  function debounce(callback, wait = 180) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => callback(...args), wait);
    };
  }

  let panoramaViewer;

  function sourceLinks(record) {
    const links = [];
    if (record.sources?.includes("wikidata")) {
      links.push(`<a href="${escapeAttr(record.sourceUrl)}" target="_blank" rel="noopener">Wikidataで確認</a>`);
    }
    if (record.sources?.includes("kofun360")) {
      const k360Url = record.sources.length === 1
        ? record.sourceUrl
        : `https://github.com/TeamTest57/Kofun360`;
      links.push(`<a href="${escapeAttr(k360Url)}" target="_blank" rel="noopener">Kofun360を開く</a>`);
    }
    if (record.articleUrl) {
      links.push(`<a href="${escapeAttr(record.articleUrl)}" target="_blank" rel="noopener">Wikipediaで歴史を読む</a>`);
    }
    links.push(`<a href="https://www.openstreetmap.org/?mlat=${encodeURIComponent(record.lat)}&mlon=${encodeURIComponent(record.lng)}#map=16/${encodeURIComponent(record.lat)}/${encodeURIComponent(record.lng)}" target="_blank" rel="noopener">大きな地図で見る</a>`);
    return links.join("");
  }

  function openDetail(record) {
    if (!record) return;
    if (panoramaViewer?.destroy) {
      panoramaViewer.destroy();
      panoramaViewer = null;
    }
    const image = record.image;
    const facts = [
      ["形", record.shape || "出典を参照"],
      ["規模", record.length || "出典を参照"],
      ["時期", record.period || "出典を参照"]
    ];
    dom.detail.innerHTML = `
      <div class="detail-visual">
        ${imageMarkup(record)}
      </div>
      <div class="detail-body">
        <p class="detail-kicker">${escapeHtml(record.prefecture || "JAPAN")} ${record.isPanorama ? "・ 360° VIEW" : ""}</p>
        <h2>${escapeHtml(record.name)}</h2>
        <p class="detail-location">${escapeHtml(locationLabel(record))}${record.group ? ` ／ ${escapeHtml(record.group)}` : ""}</p>
        <p class="detail-description">${escapeHtml(record.description || genericDescription)}</p>
        <div class="detail-facts">
          ${facts.map(([label, content]) => `<div><small>${label}</small><b>${escapeHtml(content)}</b></div>`).join("")}
        </div>
        ${image ? `
          <div class="license-box">
            <b>画像：</b> ${escapeHtml(image.author || "作者情報は元ページを参照")} ／
            <a href="${escapeAttr(image.licenseUrl || image.pageUrl)}" target="_blank" rel="noopener">${escapeHtml(image.license || "個別ライセンス")}</a>
            ${image.pageUrl ? ` ／ <a href="${escapeAttr(image.pageUrl)}" target="_blank" rel="noopener">画像の元ページ</a>` : ""}
          </div>
        ` : '<div class="license-box">このレコードには自由利用できる画像がまだ登録されていません。</div>'}
        <div class="detail-actions">
          ${record.isPanorama ? '<a href="#" data-start-panorama>360°ビューを開始</a>' : ""}
          ${sourceLinks(record)}
        </div>
      </div>
    `;
    dom.dialog.showModal();

    const panoramaButton = dom.detail.querySelector("[data-start-panorama]");
    if (panoramaButton) {
      panoramaButton.addEventListener("click", event => {
        event.preventDefault();
        const visual = dom.detail.querySelector(".detail-visual");
        visual.innerHTML = '<div id="panorama-viewer" class="panorama-viewer" aria-label="360度パノラマ"></div>';
        panoramaViewer = pannellum.viewer("panorama-viewer", {
          type: "equirectangular",
          panorama: record.panoramaUrl,
          preview: photoUrl(record),
          autoLoad: true,
          showControls: true,
          title: record.name,
          author: "Kofun360 contributors / CC0",
          compass: false
        });
      }, { once: true });
    }
  }

  function closeDetail() {
    if (panoramaViewer?.destroy) panoramaViewer.destroy();
    panoramaViewer = null;
    dom.dialog.close();
  }

  function recordFromEvent(event) {
    const target = event.target.closest("[data-record-id]");
    if (!target) return null;
    return records.find(record => record.id === target.dataset.recordId);
  }

  function initializeInteractions() {
    dom.heroForm.addEventListener("submit", event => {
      event.preventDefault();
      setQuery(dom.heroSearch.value);
      document.querySelector("#explore").scrollIntoView({ behavior: "smooth" });
    });
    dom.mapSearch.addEventListener("input", debounce(event => setQuery(event.target.value, { fitMap: false })));
    dom.prefecture.addEventListener("change", event => {
      state.prefecture = event.target.value;
      state.cardLimit = 12;
      renderAll({ fitMap: true });
    });
    dom.photo.addEventListener("change", event => {
      state.photoOnly = event.target.checked;
      renderAll();
    });
    dom.panorama.addEventListener("change", event => {
      state.panoramaOnly = event.target.checked;
      renderAll({ fitMap: event.target.checked });
    });
    for (const radio of document.querySelectorAll('input[name="source"]')) {
      radio.addEventListener("change", event => {
        state.source = event.target.value;
        renderAll();
      });
    }
    dom.reset.addEventListener("click", () => {
      Object.assign(state, {
        query: "",
        prefecture: "",
        photoOnly: false,
        panoramaOnly: false,
        source: "",
        cardLimit: 12
      });
      dom.heroSearch.value = "";
      dom.mapSearch.value = "";
      dom.prefecture.value = "";
      dom.photo.checked = false;
      dom.panorama.checked = false;
      document.querySelector('input[name="source"][value=""]').checked = true;
      renderAll({ fitMap: true });
    });
    document.querySelectorAll("[data-focus-search]").forEach(button =>
      button.addEventListener("click", () => {
        document.querySelector("#explore").scrollIntoView({ behavior: "smooth" });
        window.setTimeout(() => dom.mapSearch.focus(), 450);
      })
    );
    document.querySelectorAll("[data-view]").forEach(button =>
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        document.querySelectorAll("[data-view]").forEach(other => {
          const active = other === button;
          other.classList.toggle("is-active", active);
          other.setAttribute("aria-pressed", String(active));
        });
        const listMode = state.view === "list";
        dom.map.hidden = listMode;
        dom.list.hidden = !listMode;
        if (!listMode) window.setTimeout(() => leafletMap?.invalidateSize(), 0);
      })
    );
    dom.loadMore.addEventListener("click", () => {
      state.cardLimit += 12;
      renderCards(filteredRecords());
    });
    dom.shuffle.addEventListener("click", () => {
      state.seed += 97;
      state.cardLimit = 12;
      renderCards(filteredRecords());
    });
    const activateRecord = event => {
      const record = recordFromEvent(event);
      if (record) openDetail(record);
    };
    dom.grid.addEventListener("click", activateRecord);
    dom.grid.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateRecord(event);
      }
    });
    dom.list.addEventListener("click", activateRecord);
    dom.list.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateRecord(event);
      }
    });
    dom.dialog.querySelector(".dialog-close").addEventListener("click", closeDetail);
    dom.dialog.addEventListener("click", event => {
      if (event.target === dom.dialog) closeDetail();
    });
    dom.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeDetail();
    });
  }

  const quiz = {
    questions: [],
    index: 0,
    score: 0,
    answered: false
  };

  function pickDistinct(items, count, seed) {
    return seededSort(items, seed).slice(0, count);
  }

  function createQuiz() {
    const withPhotos = records.filter(record => record.hasImage && record.prefecture);
    const withPrefs = records.filter(record => record.prefecture);
    const pictureRecords = pickDistinct(withPhotos, 3, Date.now());
    const questions = pictureRecords.map((record, index) => {
      const distractors = pickDistinct(
        withPhotos.filter(item => item.id !== record.id),
        3,
        hashNumber(record.id) + index
      );
      return {
        prompt: "この写真の古墳はどれ？",
        image: photoUrl(record),
        answer: record.name,
        choices: seededSort([record.name, ...distractors.map(item => item.name)], index + 19),
        note: `${record.name}（${record.prefecture}）`
      };
    });

    const locationRecord = pickDistinct(withPrefs, 1, Date.now() + 911)[0];
    const otherPrefs = pickDistinct(
      prefectures.filter(pref => pref !== locationRecord.prefecture),
      3,
      hashNumber(locationRecord.id)
    );
    questions.push({
      prompt: `${locationRecord.name}がある都道府県は？`,
      image: "",
      answer: locationRecord.prefecture,
      choices: seededSort([locationRecord.prefecture, ...otherPrefs], 71),
      note: `${locationRecord.name}は${locationRecord.prefecture}に位置します。`
    });
    questions.push({
      prompt: "代表的な「前方後円墳」の平面形に最も近いものは？",
      image: "",
      answer: "円形と方形をつないだ鍵穴形",
      choices: [
        "円形と方形をつないだ鍵穴形",
        "完全な正三角形",
        "同じ大きさの円を三つ連ねた形",
        "細長い長方形だけの形"
      ],
      note: "前方後円墳は、後円部と前方部を組み合わせた独特の墳形です。"
    });
    return seededSort(questions, new Date().getDate());
  }

  function renderQuizQuestion() {
    const question = quiz.questions[quiz.index];
    if (!question) return renderQuizResult();
    quiz.answered = false;
    dom.quizStage.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-counter"><span>QUESTION <b>${quiz.index + 1}</b> / ${quiz.questions.length}</span><span>${quiz.score} POINT</span></div>
        ${question.image ? `<img class="quiz-image" src="${escapeAttr(question.image)}" alt="問題の古墳写真" referrerpolicy="no-referrer">` : ""}
        <h3>${escapeHtml(question.prompt)}</h3>
        <div class="quiz-answers">
          ${question.choices.map(choice => `<button class="quiz-answer" type="button" data-choice="${escapeAttr(choice)}">${escapeHtml(choice)}</button>`).join("")}
        </div>
        <p class="quiz-feedback" aria-live="polite"></p>
      </div>
    `;
  }

  function answerQuiz(choice, button) {
    if (quiz.answered) return;
    quiz.answered = true;
    const question = quiz.questions[quiz.index];
    const correct = choice === question.answer;
    if (correct) quiz.score += 1;
    for (const answer of dom.quizStage.querySelectorAll(".quiz-answer")) {
      answer.disabled = true;
      if (answer.dataset.choice === question.answer) answer.classList.add("correct");
    }
    if (!correct) button.classList.add("wrong");
    const feedback = dom.quizStage.querySelector(".quiz-feedback");
    feedback.innerHTML = `${correct ? "正解です。" : `正解は「${escapeHtml(question.answer)}」。`} ${escapeHtml(question.note)}
      <br><button class="text-link" type="button" data-next-quiz>${quiz.index + 1 === quiz.questions.length ? "結果を見る" : "次の問題へ"} →</button>`;
    feedback.querySelector("[data-next-quiz]").focus();
  }

  function renderQuizResult() {
    const ratio = quiz.score / quiz.questions.length;
    const title = ratio === 1 ? "古墳博士！" : ratio >= .6 ? "古墳めぐり上級者" : "ここから古墳めぐり";
    dom.quizStage.innerHTML = `
      <div class="quiz-result">
        <p>RESULT</p>
        <strong>${quiz.score} / ${quiz.questions.length}</strong>
        <h3>${title}</h3>
        <p>問題は掲載データから毎回変わります。</p>
        <button class="primary-button" type="button" data-retry-quiz>もう一度挑戦</button>
      </div>
    `;
  }

  function startQuiz() {
    quiz.questions = createQuiz();
    quiz.index = 0;
    quiz.score = 0;
    renderQuizQuestion();
  }

  function initializeQuiz() {
    dom.startQuiz.addEventListener("click", startQuiz);
    dom.quizStage.addEventListener("click", event => {
      const answer = event.target.closest("[data-choice]");
      if (answer) answerQuiz(answer.dataset.choice, answer);
      if (event.target.closest("[data-next-quiz]")) {
        quiz.index += 1;
        renderQuizQuestion();
      }
      if (event.target.closest("[data-retry-quiz]")) startQuiz();
    });
  }

  function initialize() {
    renderPrefectures();
    renderToday();
    initializeMap();
    initializeInteractions();
    initializeQuiz();
    renderAll();
  }

  initialize();
})();
