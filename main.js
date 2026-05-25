const STORAGE_KEY = 'rembord_data';

let userData = { phone: '', nickname: '同学' };
let dailyWords = []; // 今天展示的词汇
let todayHandledWords = []; // 今天用户点击过选项的词汇（作为默写基础）
let currentBook = { key: '', name: '', words: [], cursor: 0, dailyQuota: 20 };
let bookProgress = {};
let vocabularyCache = {};

// 模拟的”以前背诵的单词库” (用于抽取10个随机词)
let mockPastLearnedWords = [
    { word: 'apple', translation: 'n. 苹果', phonetic: 'ˈæpl' },
    { word: 'banana', translation: 'n. 香蕉', phonetic: 'bəˈnɑːnə' },
    { word: 'computer', translation: 'n. 计算机', phonetic: 'kəmˈpjuːtə(r)' },
    { word: 'student', translation: 'n. 学生', phonetic: 'ˈstjuːdnt' },
    { word: 'university', translation: 'n. 大学', phonetic: 'ˌjuːnɪˈvɜːsəti' },
    { word: 'library', translation: 'n. 图书馆', phonetic: 'ˈlaɪbrəri' },
    { word: 'water', translation: 'n. 水', phonetic: 'ˈwɔːtə(r)' },
    { word: 'music', translation: 'n. 音乐', phonetic: 'ˈmjuːzɪk' },
    { word: 'history', translation: 'n. 历史', phonetic: 'ˈhɪstri' },
    { word: 'future', translation: 'n. 未来', phonetic: 'ˈfjuːtʃə(r)' },
    { word: 'science', translation: 'n. 科学', phonetic: 'ˈsaɪəns' },
    { word: 'language', translation: 'n. 语言', phonetic: 'ˈlæŋɡwɪdʒ' }
];

// 生词本：按日期归档
// 格式：{ '2026-05-24': [ {word:'abandon', translation:'...'} ] }
let unfamiliarBook = {};

// 学习历史：按日期归档所有处理过的单词
let studyHistory = {};
let reviewSchedule = {};
let learningStats = {};
let currentCalendarDate = new Date();
let sessionStartTime = Date.now();

// 词根/词族数据：由 data/word_family.json 离线提供
let wordFamilyData = null;
let onlineFamilyCache = {};

// 专注模式状态
let focusQueue = [];
let focusIndex = 0;
let focusFlipped = false;

// 默写测试全局状态
let dictationQueue = [];
let currentDictationIndex = 0;
let currentDictationMode = ''; // 'hide-cn' 掩盖中文，'hide-en' 掩盖英文

// 听写模式全局状态
let dictateQueue = [];
let currentDictateIndex = 0;
let dictateCorrect = 0;
let dictateWrong = 0;

// 能量花园状态
let gardenState = {
    water: 0,
    pots: [], // { plant: null | { stage, waterCount, type } }
    selectedPot: -1,
    flowerRoom: []
};
const PLANT_TYPES = ['🌻 向日葵', '🌹 玫瑰', '🌷 郁金香', '🌼 雏菊'];
const PLANT_EMOJIS = [
    ['🌰', '🌱', '🌿', '🌻'],
    ['🌰', '🌱', '🌿', '🌹'],
    ['🌰', '🌱', '🌿', '🌷'],
    ['🌰', '🌱', '🌿', '🌼']
];
const STAGE_NAMES = ['种子', '发芽', '幼苗', '开花'];
const PLANT_COST = 12;
const WATER_COST = 8;
const HARVEST_REWARD = 18;

// --- 0. 工具函数 ---
function shuffleArray(array) {
    let arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function getTodayDateStr() {
    return new Date().toISOString().split('T')[0]; // 例如: 2026-05-24
}

function addDays(dateStr, days) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

function getDateRange(startDate, endDate) {
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return dates;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
    }
    return dates;
}

function calculateDailyQuota(totalWords, startDateValue, endDateValue) {
    const start = startDateValue ? new Date(startDateValue) : new Date();
    const end = endDateValue ? new Date(endDateValue) : start;
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 20;
    const dayMs = 24 * 60 * 60 * 1000;
    const days = Math.max(1, Math.floor((end - start) / dayMs) + 1);
    return Math.max(1, Math.ceil(totalWords / days));
}

function getBookName(bookKey) {
    const names = {
        cet4: '四级核心词汇',
        cet6: '六级高频词汇',
        ielts: '雅思红宝书',
        kaoyan: '考研必背词汇'
    };
    return names[bookKey] || bookKey || '词库';
}

async function getVocabularyBook(bookKey) {
    if (!bookKey) return [];
    if (bookProgress[bookKey]?.customWords) return bookProgress[bookKey].customWords;
    if (!vocabularyCache[bookKey]) {
        vocabularyCache[bookKey] = await loadVocabularyBook(bookKey);
    }
    return vocabularyCache[bookKey];
}

async function loadVocabularyBook(bookKey) {
    try {
        const response = await fetch(`./data/${bookKey}.json`);
        if (!response.ok) throw new Error(`无法读取文件: ${bookKey}.json`);
        return await response.json();
    } catch (error) {
        console.error('词库读取失败:', error);
        alert('词库文件读取失败。如果你是双击打开页面，部分浏览器可能会限制读取本地 JSON。建议运行 server.py 或 python -m http.server 后访问 http://localhost:端口。');
        return [];
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function cleanTranslation(value) {
    return String(value || '暂无')
        .replace(/\\n/g, '；')
        .replace(/\/n/g, '；')
        .replace(/\n/g, '；')
        .replace(/\s*；\s*/g, '；')
        .replace(/；+/g, '；')
        .replace(/^；|；$/g, '');
}

async function ensureWordFamilyData() {
    if (wordFamilyData) return wordFamilyData;
    try {
        const res = await fetch('./data/word_family.json');
        if (!res.ok) throw new Error('word_family.json load failed');
        wordFamilyData = await res.json();
    } catch (error) {
        console.error('词族数据加载失败', error);
        wordFamilyData = { families: {} };
    }
    return wordFamilyData;
}

function normalizeWord(word) {
    return String(word || '').toLowerCase().replace(/[^a-z-]/g, '');
}

function renderWordFamilyButton(word) {
    return `<button class="family-btn" onclick="event.stopPropagation(); showWordFamily('${escapeHtml(word)}')">我的家族</button>`;
}

const BASIC_AFFIX_RULES = [
    {
        type: 'prefix',
        value: 'dis-',
        raw: 'dis',
        meaning: '不、否定；分离、相反、除去',
        className: 'prefix',
        minRest: 3,
        exceptions: ['disc', 'discipline', 'disco', 'discover', 'discovery', 'discuss', 'discussion', 'disease']
    },
    {
        type: 'prefix',
        value: 'in-',
        raw: 'in',
        meaning: '不、无、非；也可表示“在内、进入”',
        className: 'prefix',
        minRest: 3,
        exceptions: ['inch', 'income', 'indeed', 'index', 'industry', 'infant', 'inside', 'instead', 'instrument', 'interest', 'internet', 'into']
    },
    {
        type: 'prefix',
        value: 'im-',
        raw: 'im',
        meaning: 'in- 的变体：不、无、非；常用于 b/m/p 前',
        className: 'prefix',
        minRest: 3,
        exceptions: ['image', 'imagine', 'imitate', 'immune', 'impact']
    },
    {
        type: 'prefix',
        value: 'il-',
        raw: 'il',
        meaning: 'in- 的变体：不、无、非；常用于 l 前',
        className: 'prefix',
        minRest: 3,
        exceptions: ['ill', 'illusion', 'illustrate']
    },
    {
        type: 'prefix',
        value: 'ir-',
        raw: 'ir',
        meaning: 'in- 的变体：不、无、非；常用于 r 前',
        className: 'prefix',
        minRest: 3,
        exceptions: ['iron']
    },
    {
        type: 'suffix',
        value: '-tion',
        raw: 'tion',
        meaning: '名词后缀：行为、过程、结果、状态',
        className: 'noun-forming suffix',
        minStem: 3
    },
    {
        type: 'suffix',
        value: '-sion',
        raw: 'sion',
        meaning: '名词后缀：行为、过程、结果、状态',
        className: 'noun-forming suffix',
        minStem: 3
    },
    {
        type: 'suffix',
        value: '-ion',
        raw: 'ion',
        meaning: '名词后缀：行为、过程、结果、状态',
        className: 'noun-forming suffix',
        minStem: 3
    },
    {
        type: 'suffix',
        value: '-ment',
        raw: 'ment',
        meaning: '名词后缀：行为、过程、结果、实例',
        className: 'noun-forming suffix',
        minStem: 3
    },
    {
        type: 'suffix',
        value: '-ness',
        raw: 'ness',
        meaning: '名词后缀：性质、状态',
        className: 'noun-forming suffix',
        minStem: 3
    },
    {
        type: 'suffix',
        value: '-less',
        raw: 'less',
        meaning: '形容词后缀：没有、缺少',
        className: 'adjective-forming suffix',
        minStem: 3
    },
    {
        type: 'suffix',
        value: '-able',
        raw: 'able',
        meaning: '形容词后缀：能够……的、可被……的',
        className: 'adjective-forming suffix',
        minStem: 3
    },
    {
        type: 'suffix',
        value: '-ible',
        raw: 'ible',
        meaning: '形容词后缀：能够……的、可被……的',
        className: 'adjective-forming suffix',
        minStem: 3
    }
];

function getBasicAffixAnalysis(word, existingRoots = []) {
    const normalized = normalizeWord(word);
    const existing = new Set(existingRoots.map(root => String(root.root || '').toLowerCase()));
    const result = [];
    const matchedPrefixRanges = [];
    const matchedSuffixRanges = [];

    BASIC_AFFIX_RULES.forEach(rule => {
        if (existing.has(rule.value.toLowerCase()) || existing.has(rule.raw.toLowerCase())) return;

        if (rule.type === 'prefix') {
            if (!normalized.startsWith(rule.raw)) return;
            if (rule.exceptions?.includes(normalized)) return;
            const rest = normalized.slice(rule.raw.length);
            if (rest.length < rule.minRest) return;
            if (matchedPrefixRanges.some(length => length >= rule.raw.length)) return;
            matchedPrefixRanges.push(rule.raw.length);
        } else {
            if (!normalized.endsWith(rule.raw)) return;
            const stem = normalized.slice(0, -rule.raw.length);
            if (stem.length < rule.minStem) return;
            if (matchedSuffixRanges.some(length => length >= rule.raw.length)) return;
            matchedSuffixRanges.push(rule.raw.length);
        }

        result.push({
            root: rule.value,
            meaning: rule.meaning,
            class: rule.className,
            origin: '基础词缀规则',
            source: 'rule'
        });
    });

    return result;
}

function uniqWords(words, limit = 12) {
    const seen = new Set();
    const result = [];
    for (const raw of words || []) {
        const word = normalizeWord(raw);
        if (!word || seen.has(word)) continue;
        seen.add(word);
        result.push(word);
        if (result.length >= limit) break;
    }
    return result;
}

async function fetchJsonOrNull(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (error) {
        console.warn('联网词族查询失败', url, error);
        return null;
    }
}

async function fetchOnlineWordRelations(word) {
    const normalized = normalizeWord(word);
    if (!normalized) return { synonyms: [], antonyms: [], sources: [] };
    if (onlineFamilyCache[normalized]) return onlineFamilyCache[normalized];

    const [dictData, datamuseSyns, datamuseAnts] = await Promise.all([
        fetchJsonOrNull(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(normalized)}`),
        fetchJsonOrNull(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(normalized)}&max=12`),
        fetchJsonOrNull(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(normalized)}&max=12`)
    ]);

    let synonyms = [];
    let antonyms = [];
    let sources = [];

    if (Array.isArray(dictData)) {
        sources.push('Free Dictionary API');
        dictData.forEach(entry => {
            (entry.meanings || []).forEach(meaning => {
                synonyms.push(...(meaning.synonyms || []));
                antonyms.push(...(meaning.antonyms || []));
                (meaning.definitions || []).forEach(def => {
                    synonyms.push(...(def.synonyms || []));
                    antonyms.push(...(def.antonyms || []));
                });
            });
        });
    }

    if (Array.isArray(datamuseSyns)) {
        sources.push('Datamuse');
        synonyms.push(...datamuseSyns.map(item => item.word));
    }

    if (Array.isArray(datamuseAnts)) {
        sources.push('Datamuse');
        antonyms.push(...datamuseAnts.map(item => item.word));
    }

    onlineFamilyCache[normalized] = {
        synonyms: uniqWords(synonyms.filter(w => normalizeWord(w) !== normalized), 12),
        antonyms: uniqWords(antonyms.filter(w => normalizeWord(w) !== normalized), 12),
        sources: [...new Set(sources)]
    };
    return onlineFamilyCache[normalized];
}

// --- 持久化 ---
function saveAppData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            unfamiliarBook,
            todayHandledWords,
            dailyWords,
            currentBook,
            bookProgress,
            userData,
            garden: gardenState,
            studyHistory,
            reviewSchedule,
            learningStats
        }));
    } catch (e) { console.error('保存失败', e); }
}

function loadAppData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (data.unfamiliarBook) unfamiliarBook = data.unfamiliarBook;
        if (data.todayHandledWords) todayHandledWords = data.todayHandledWords;
        if (data.dailyWords) dailyWords = data.dailyWords;
        if (data.currentBook) currentBook = { ...currentBook, ...data.currentBook };
        if (data.bookProgress) bookProgress = data.bookProgress;
        if (!Object.keys(bookProgress).length && currentBook.key) {
            bookProgress[currentBook.key] = {
                ...currentBook,
                dailyWords: [...dailyWords],
                todayHandledWords: [...todayHandledWords]
            };
        }
        if (data.userData) userData = { ...userData, ...data.userData };
        if (data.garden) {
            gardenState = { ...gardenState, ...data.garden };
            if (!Array.isArray(gardenState.pots)) gardenState.pots = [];
            if (!Array.isArray(gardenState.flowerRoom)) gardenState.flowerRoom = [];
        }
        if (data.studyHistory) studyHistory = data.studyHistory;
        if (data.reviewSchedule) reviewSchedule = data.reviewSchedule;
        if (data.learningStats) learningStats = data.learningStats;
    } catch (e) { console.error('读取失败', e); }
}

// 弹窗控制绑定为全局函数，供 HTML 调用
window.closeModal = function(id) { document.getElementById(id).classList.remove('active'); }
window.openModal = function(id) { document.getElementById(id).classList.add('active'); }

window.showWordFamily = async function(word) {
    const normalized = normalizeWord(word);
    const title = document.getElementById('family-word-title');
    const body = document.getElementById('family-content');

    title.innerText = `「${word}」的家族`;
    body.innerHTML = `
        <div class="family-empty">
            <div class="family-pet">🐾</div>
            <p>正在联网查询，请稍等...</p>
        </div>
    `;
    window.openModal('word-family-modal');

    const data = await ensureWordFamilyData();
    const info = data.families?.[normalized];
    const online = await fetchOnlineWordRelations(normalized);

    const roots = [...(info?.roots || []), ...getBasicAffixAnalysis(normalized, info?.roots || [])];
    const rootsHtml = roots.length ? roots.map(root => `
        <div class="family-root-card">
            <div class="family-root-head">
                <span class="family-root">${escapeHtml(root.root)}</span>
                <span class="family-root-tag">${escapeHtml(root.class || 'root')}</span>
            </div>
            <div class="family-meaning"><strong>意思：</strong>${escapeHtml(root.meaning)}</div>
            ${root.origin ? `<div class="family-origin">来源：${escapeHtml(root.origin)}</div>` : ''}
        </div>
    `).join('') : '<span class="family-muted">暂无</span>';

    const chips = words => words && words.length
        ? words.map(w => `<button class="family-chip" onclick="speakWord('${escapeHtml(w)}')">${escapeHtml(w)}</button>`).join('')
        : '<span class="family-muted">暂无</span>';

    body.innerHTML = `
        <div class="family-section">
            <h4>词根 / 词缀分析</h4>
            ${rootsHtml}
        </div>
        <div class="family-section">
            <h4>同根词</h4>
            <div class="family-chip-list">${chips(info?.family || [])}</div>
        </div>
        <div class="family-section">
            <h4>同义词</h4>
            <div class="family-chip-list">${chips(online.synonyms)}</div>
        </div>
        <div class="family-section">
            <h4>反义词</h4>
            <div class="family-chip-list">${chips(online.antonyms)}</div>
        </div>
        <p class="family-note">词根/词缀来自 ECDICT 明确例词匹配和基础词缀规则；不确定时显示暂无。同义词/反义词来自联网词典接口。</p>
        ${online.sources.length ? `<p class="family-note">联网来源：${online.sources.map(escapeHtml).join('、')}</p>` : '<p class="family-note">联网来源：暂无可用结果</p>'}
    `;
}

// --- API 辅助函数 ---
async function apiPost(path, body) {
    try {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        return { error: '网络错误，请通过 http://localhost:5000 访问并确保后端已启动' };
    }
}
async function apiGet(path) {
    try {
        const res = await fetch(path, { credentials: 'include' });
        return await res.json();
    } catch (e) {
        return { error: '网络错误' };
    }
}
async function apiUpload(path, formData) {
    try {
        const res = await fetch(path, { method: 'POST', credentials: 'include', body: formData });
        return await res.json();
    } catch (e) {
        return { error: '网络错误' };
    }
}

async function syncStudyHistoryFromServer() {
    const data = await apiGet('/api/study-records');
    if (data.history) {
        studyHistory = { ...studyHistory, ...data.history };
        saveAppData();
    }
}

async function persistStudyRecord(wordData, category = '') {
    const todayStr = getTodayDateStr();
    const payload = {
        date: todayStr,
        word: wordData.word,
        phonetic: wordData.phonetic || '',
        translation: wordData.translation || '',
        category,
        source: currentBook.key || 'local'
    };
    const data = await apiPost('/api/study-records', payload);
    if (data.error && data.error !== '未登录') {
        console.warn('学习记录同步失败', data.error);
    }
}

function getTodayReviewWords() {
    const todayStr = getTodayDateStr();
    return (reviewSchedule[todayStr] || []).map(item => ({
        ...item,
        isReview: true,
        firstSeenDate: item.firstSeenDate || item.originalDate || todayStr,
        reviewDueDate: todayStr
    }));
}

function scheduleReview(wordData, category) {
    const todayStr = getTodayDateStr();
    const normalized = normalizeWord(wordData.word);
    if (!normalized) return;

    const intervals = category === 'unfamiliar' ? [1, 2, 4, 7, 15, 30] : [5];
    intervals.forEach((days, stage) => {
        const dueDate = addDays(todayStr, days);
        if (!reviewSchedule[dueDate]) reviewSchedule[dueDate] = [];
        reviewSchedule[dueDate] = reviewSchedule[dueDate].filter(item => normalizeWord(item.word) !== normalized);
        reviewSchedule[dueDate].push({
            ...wordData,
            isReview: true,
            reviewStage: stage + 1,
            firstSeenDate: wordData.firstSeenDate || todayStr,
            originalDate: todayStr,
            reason: category
        });
    });
}

function updateLearningStats(wordData, category) {
    const todayStr = getTodayDateStr();
    if (!learningStats[todayStr]) {
        learningStats[todayStr] = { learned: 0, review: 0, target: currentBook.dailyQuota || dailyWords.length || 0, seconds: 0 };
    }
    const stat = learningStats[todayStr];
    stat.target = Math.max(stat.target || 0, currentBook.dailyQuota || dailyWords.length || 0);
    if (wordData.isReview) stat.review += 1;
    else stat.learned += 1;
    const now = Date.now();
    stat.seconds += Math.max(5, Math.min(600, Math.round((now - sessionStartTime) / 1000)));
    sessionStartTime = now;
}

async function loadAllVocabularyBooks() {
    const keys = ['cet4', 'cet6', 'ielts', 'kaoyan'];
    const lists = await Promise.all(keys.map(getVocabularyBook));
    const map = new Map();
    lists.flat().forEach(item => {
        const key = normalizeWord(item.word);
        if (key && !map.has(key)) map.set(key, item);
    });
    return [...map.values()];
}

function isChineseQuery(query) {
    return /[\u4e00-\u9fa5]/.test(query);
}

async function searchLocalVocabulary(query) {
    const normalized = normalizeWord(query);
    const allWords = await loadAllVocabularyBooks();
    if (isChineseQuery(query)) {
        return allWords
            .filter(item => (item.translation || '').includes(query))
            .slice(0, 20);
    }
    return allWords
        .filter(item => normalizeWord(item.word) === normalized || normalizeWord(item.word).includes(normalized))
        .slice(0, 20);
}

function parseDictionaryEntry(entry) {
    const phonetic = entry.phonetic || (entry.phonetics || []).find(p => p.text)?.text || '';
    const lines = [];
    (entry.meanings || []).forEach(meaning => {
        const definition = meaning.definitions?.[0]?.definition;
        if (definition) lines.push(`${meaning.partOfSpeech || ''}. ${definition}`.trim());
    });
    return {
        word: entry.word,
        phonetic,
        translation: cleanTranslation(lines.slice(0, 4).join('\n') || '暂无释义')
    };
}

async function searchOnlineEnglish(query) {
    const data = await apiGet(`/api/dictionary/${encodeURIComponent(normalizeWord(query))}`);
    if (data.entries && Array.isArray(data.entries)) {
        return data.entries.map(parseDictionaryEntry).filter(item => item.word);
    }
    return [];
}

function renderSearchResults(results, query) {
    const container = document.getElementById('search-result');
    if (!results.length) {
        container.innerHTML = `<div class="search-empty">没有找到「${escapeHtml(query)}」相关结果。<br>可以换一个更具体的中文释义或英文单词试试。</div>`;
        return;
    }
    container.innerHTML = results.map((item, index) => `
        <div class="search-card">
            <div class="search-word">${escapeHtml(item.word)} <span onclick="speakWord('${escapeHtml(item.word)}')" style="cursor:pointer;">🔊</span></div>
            ${item.phonetic ? `<div class="search-phonetic">${escapeHtml(item.phonetic)}</div>` : ''}
            <div class="search-translation">${escapeHtml(cleanTranslation(item.translation || '暂无释义'))}</div>
            <div class="search-actions">
                <button class="search-add-btn" onclick="addSearchWordToToday(${index})">加入今日任务</button>
                <button class="search-family-btn" onclick="showWordFamily('${escapeHtml(item.word)}')">我的家族</button>
            </div>
        </div>
    `).join('');
    window.currentSearchResults = results;
}

async function performSearch() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return alert('请输入要搜索的内容');
    const container = document.getElementById('search-result');
    container.innerHTML = '<div class="search-empty">正在搜索...</div>';

    let results = await searchLocalVocabulary(query);
    if (!isChineseQuery(query)) {
        const onlineResults = await searchOnlineEnglish(query);
        const seen = new Set(results.map(item => normalizeWord(item.word)));
        onlineResults.forEach(item => {
            const key = normalizeWord(item.word);
            if (key && !seen.has(key)) {
                seen.add(key);
                results.push(item);
            }
        });
    }
    renderSearchResults(results, query);
}

window.addSearchWordToToday = function(index) {
    const wordData = window.currentSearchResults?.[index];
    if (!wordData) return;
    if (!dailyWords.some(w => normalizeWord(w.word) === normalizeWord(wordData.word))) {
        dailyWords.push(wordData);
    }
    if (!currentBook.name) currentBook.name = '搜索加入';
    renderWordList(currentBook.name);
    saveAppData();
    alert(`已加入今日任务：${wordData.word}`);
}

function updateAvatarUI(url) {
    if (!url) return;
    const els = ['avatar-preview', 'sidebar-avatar', 'profile-avatar'];
    els.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.backgroundImage = `url(${url})`;
    });
}

function enterMainScreen() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
    loadAppData();
    if (gardenState.pots.length === 0) {
        gardenState.pots = Array.from({ length: 6 }, () => ({ plant: null }));
        saveAppData();
    }
    initPlantSelector();
    renderGarden();
    document.getElementById('sidebar-nickname').innerText = userData.nickname || '同学';
    updateAvatarUI(userData.avatar_url);
    syncStudyHistoryFromServer();
    renderBookSidebar();
    if (dailyWords.length > 0) {
        renderWordList(currentBook.name || '今日学习');
    }
}

// --- 1. 登录与初始化 ---
let authMode = 'login'; // 'login' | 'register'

function setAuthMode(mode) {
    authMode = mode;
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-btn');
    const confirmGroup = document.getElementById('confirm-password-group');
    const toggleText = document.getElementById('auth-toggle-text');
    const toggleLink = document.getElementById('auth-toggle-link');
    if (mode === 'login') {
        title.innerText = '登录背单词';
        btn.innerText = '登录';
        confirmGroup.style.display = 'none';
        toggleText.innerText = '还没有账号？';
        toggleLink.innerText = '立即注册';
    } else {
        title.innerText = '注册账号';
        btn.innerText = '注册';
        confirmGroup.style.display = 'block';
        toggleText.innerText = '已有账号？';
        toggleLink.innerText = '立即登录';
    }
}

document.getElementById('auth-toggle-link').addEventListener('click', (e) => {
    e.preventDefault();
    setAuthMode(authMode === 'login' ? 'register' : 'login');
});

document.getElementById('auth-btn').addEventListener('click', async () => {
    const phone = document.getElementById('phone').value.trim();
    const password = document.getElementById('password').value.trim();
    const confirm = document.getElementById('confirm-password').value.trim();

    if (!phone || !password) return alert('请填写手机号和密码');
    if (authMode === 'register' && password !== confirm) return alert('两次密码不一致');

    const endpoint = authMode === 'login' ? '/api/login' : '/api/register';
    const payload = { phone, password, nickname: '' };
    const data = await apiPost(endpoint, payload);

    if (data.error) return alert(data.error);

    userData.phone = data.user.phone;
    userData.nickname = data.user.nickname || '同学';
    userData.avatar_url = data.user.avatar_url || '';
    saveAppData();

    if (authMode === 'register' || !data.user.nickname) {
        // 新用户或没有昵称，进入完善信息
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('setup-screen').classList.add('active');
        const todayStr = getTodayDateStr();
        const nextMonth = new Date(); nextMonth.setDate(new Date().getDate() + 30);
        document.getElementById('start-date').value = todayStr;
        document.getElementById('end-date').value = nextMonth.toISOString().split('T')[0];
    } else {
        enterMainScreen();
    }
});

// 头像上传辅助
function bindAvatarInput(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    preview.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
        if (!input.files || !input.files[0]) return;
        const fd = new FormData();
        fd.append('avatar', input.files[0]);
        const data = await apiUpload('/api/avatar', fd);
        if (data.error) return alert(data.error);
        userData.avatar_url = data.avatar_url;
        saveAppData();
        updateAvatarUI(data.avatar_url);
    });
}
bindAvatarInput('avatar-input', 'avatar-preview');
bindAvatarInput('profile-avatar-input', 'profile-avatar');

document.getElementById('setup-btn').addEventListener('click', async () => {
    const nick = document.getElementById('nickname').value.trim();
    if (nick) userData.nickname = nick;
    saveAppData();
    enterMainScreen();
});

// 页面加载时检查登录状态
(async function initAuth() {
    const data = await apiGet('/api/me');
    if (data.user) {
        userData.phone = data.user.phone;
        userData.nickname = data.user.nickname || '同学';
        userData.avatar_url = data.user.avatar_url || '';
        saveAppData();
        enterMainScreen();
    }
})();

// --- 账户信息与退出 ---
document.getElementById('sidebar-profile-btn').addEventListener('click', async () => {
    window.toggleSidebar();
    const data = await apiGet('/api/me');
    if (data.error) return alert(data.error);
    const u = data.user;
    document.getElementById('profile-phone').value = u.phone || '';
    document.getElementById('profile-nickname').value = u.nickname || '';
    document.getElementById('profile-created').value = u.created_at ? u.created_at.split('T')[0] : '';
    updateAvatarUI(u.avatar_url);
    window.openModal('profile-modal');
});

document.getElementById('profile-save-btn').addEventListener('click', async () => {
    const nick = document.getElementById('profile-nickname').value.trim();
    if (!nick) return alert('昵称不能为空');
    // 目前后端没有 /api/update 接口，先更新本地，后续可扩展
    userData.nickname = nick;
    saveAppData();
    document.getElementById('sidebar-nickname').innerText = nick;
    alert('保存成功');
    window.closeModal('profile-modal');
});

async function doLogout() {
    await apiPost('/api/logout', {});
    localStorage.removeItem(STORAGE_KEY);
    location.reload();
}

document.getElementById('sidebar-logout-btn').addEventListener('click', () => {
    window.toggleSidebar();
    if (confirm('确定要退出登录吗？')) doLogout();
});

document.getElementById('profile-logout-btn').addEventListener('click', () => {
    if (confirm('确定要退出登录吗？')) doLogout();
});

// 底部 Tab
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', function() {
        navItems.forEach(nav => nav.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(`tab-${this.getAttribute('data-tab')}`).classList.add('active');
    });
});

document.getElementById('search-btn').addEventListener('click', () => {
    document.getElementById('search-input').value = '';
    document.getElementById('search-result').innerHTML = '<div class="search-empty">支持中文查英文，也支持英文联网查词。</div>';
    window.openModal('search-modal');
});

document.getElementById('search-submit-btn').addEventListener('click', performSearch);
document.getElementById('search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
});

document.getElementById('book-select').addEventListener('change', (e) => {
    if (e.target.value === '__custom__') {
        document.getElementById('custom-book-file').click();
    }
});

document.getElementById('custom-book-file').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
        const text = await file.text();
        const words = parseCustomBook(text, file.name);
        if (!words.length) return alert('没有识别到单词。JSON 需包含 word/translation 字段；CSV/TXT 每行可写 word,translation。');
        const key = `custom_${Date.now()}`;
        const name = file.name.replace(/\.[^.]+$/, '').slice(0, 16) || '自定义词库';
        bookProgress[key] = {
            key,
            name,
            words: shuffleArray(words),
            customWords: words,
            cursor: 0,
            dailyQuota: 20,
            dailyWords: [],
            todayHandledWords: []
        };
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${name}（自定义）`;
        document.getElementById('book-select').appendChild(option);
        document.getElementById('book-select').value = key;
        renderBookSidebar();
        saveAppData();
        alert(`已添加自定义词库：${name}，共 ${words.length} 词`);
    } catch (error) {
        console.error(error);
        alert('自定义词库读取失败，请检查文件格式。');
    } finally {
        e.target.value = '';
        if (document.getElementById('book-select').value === '__custom__') {
            document.getElementById('book-select').value = '';
        }
    }
});

function parseCustomBook(text, filename) {
    if (filename.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(text);
        const list = Array.isArray(data) ? data : data.words;
        if (!Array.isArray(list)) return [];
        return list.map(item => ({
            word: String(item.word || item.en || item.english || '').trim(),
            phonetic: String(item.phonetic || '').trim(),
            translation: cleanTranslation(item.translation || item.cn || item.chinese || item.meaning || '')
        })).filter(item => item.word);
    }
    return text.split(/\r?\n/).map(line => {
        const parts = line.split(/,|\t/);
        return {
            word: String(parts[0] || '').trim(),
            phonetic: '',
            translation: cleanTranslation(parts.slice(1).join(' ') || '')
        };
    }).filter(item => item.word);
}

function renderBookSidebar() {
    syncCustomBookOptions();
    const list = document.getElementById('book-list');
    const keys = Object.keys(bookProgress);
    const items = keys.map(key => {
        const progress = bookProgress[key];
        const active = key === currentBook.key ? 'active' : '';
        const count = progress.dailyWords?.length || 0;
        return `
            <div class="book-side-row ${active}" onclick="switchBook('${escapeHtml(key)}')">
                <div class="book-item ${active}">${escapeHtml((progress.name || getBookName(key)).substring(0, 2))}</div>
                <div class="book-side-meta">
                    <strong>${escapeHtml(progress.name || getBookName(key))}</strong>
                    <span>${count} 词 · 已到 ${progress.cursor || 0}</span>
                </div>
                <button class="book-delete-btn" onclick="event.stopPropagation(); deleteBook('${escapeHtml(key)}')">×</button>
            </div>
        `;
    }).join('');
    list.innerHTML = `
        ${items || '<div class="sidebar-empty">还没有词库</div>'}
        <button class="book-add-btn" id="sidebar-add-book-btn">＋ 添加词库</button>
        ${currentBook.key ? '<button class="book-add-btn ghost" id="sidebar-edit-book-btn">⚙ 更改当前设置</button>' : ''}
    `;
    document.getElementById('sidebar-add-book-btn')?.addEventListener('click', () => {
        window.toggleSidebar();
        const todayStr = getTodayDateStr();
        const nextMonth = new Date(); nextMonth.setDate(new Date().getDate() + 30);
        document.getElementById('start-date').value = todayStr;
        document.getElementById('end-date').value = nextMonth.toISOString().split('T')[0];
        document.getElementById('import-state').style.display = 'flex';
        document.getElementById('learning-state').style.display = 'none';
    });
    document.getElementById('sidebar-edit-book-btn')?.addEventListener('click', () => {
        window.toggleSidebar();
        if (currentBook.key) document.getElementById('book-select').value = currentBook.key;
        const todayStr = getTodayDateStr();
        const nextMonth = new Date(); nextMonth.setDate(new Date().getDate() + 30);
        if (!document.getElementById('start-date').value) document.getElementById('start-date').value = todayStr;
        if (!document.getElementById('end-date').value) document.getElementById('end-date').value = nextMonth.toISOString().split('T')[0];
        document.getElementById('import-state').style.display = 'flex';
        document.getElementById('learning-state').style.display = 'none';
    });
}

function syncCustomBookOptions() {
    const select = document.getElementById('book-select');
    Object.keys(bookProgress).forEach(key => {
        const progress = bookProgress[key];
        if (!key.startsWith('custom_') || select.querySelector(`option[value="${key}"]`)) return;
        const option = document.createElement('option');
        option.value = key;
        option.textContent = `${progress.name || '自定义词库'}（自定义）`;
        select.appendChild(option);
    });
}

window.deleteBook = function(bookKey) {
    const progress = bookProgress[bookKey];
    if (!progress) return;
    if (!confirm(`确定删除「${progress.name || getBookName(bookKey)}」吗？学习记录不会删除。`)) return;
    delete bookProgress[bookKey];
    delete vocabularyCache[bookKey];
    if (currentBook.key === bookKey) {
        currentBook = { key: '', name: '', words: [], cursor: 0, dailyQuota: 20 };
        dailyWords = [];
        todayHandledWords = [];
        document.getElementById('learning-state').style.display = 'none';
        document.getElementById('import-state').style.display = 'flex';
    }
    renderBookSidebar();
    saveAppData();
}

window.switchBook = async function(bookKey) {
    const progress = bookProgress[bookKey];
    if (!progress) return;
    currentBook = { ...currentBook, ...progress };
    currentBook.words = currentBook.words?.length ? currentBook.words : shuffleArray(await getVocabularyBook(bookKey));
    dailyWords = [...(progress.dailyWords || [])];
    todayHandledWords = [...(progress.todayHandledWords || [])];
    renderWordList(currentBook.name || getBookName(bookKey));
    renderBookSidebar();
    saveAppData();
    window.toggleSidebar();
}

// --- 2. 词库拉取与任务生成 ---
document.getElementById('import-btn').addEventListener('click', async () => {
    const bookSelect = document.getElementById('book-select');
    const bookKey = bookSelect.value;
    if (bookKey === '__custom__') {
        document.getElementById('custom-book-file').click();
        return;
    }
    if (!bookKey) return alert('请先选择一个词库！');
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;
    
    const btn = document.getElementById('import-btn');
    btn.innerText = "正在打乱数据...";
    btn.disabled = true;

    let fullWordList = await getVocabularyBook(bookKey);
    if (fullWordList.length > 0) {
        fullWordList = shuffleArray(fullWordList);
        const dailyQuota = calculateDailyQuota(fullWordList.length, startDate, endDate);
        const reviewWords = getTodayReviewWords();
        const reviewSet = new Set(reviewWords.map(w => normalizeWord(w.word)));
        const newWords = fullWordList.filter(w => !reviewSet.has(normalizeWord(w.word))).slice(0, dailyQuota);
        dailyWords = [...reviewWords, ...newWords];
        todayHandledWords = []; // 重置今日已处理

        const bookName = bookSelect.options[bookSelect.selectedIndex].text.split(' ')[0];
        currentBook = {
            key: bookKey,
            name: bookName,
            words: fullWordList,
            cursor: newWords.length,
            dailyQuota
        };
        if (bookProgress[bookKey]?.customWords) currentBook.customWords = bookProgress[bookKey].customWords;
        bookProgress[bookKey] = {
            ...currentBook,
            dailyWords: [...dailyWords],
            todayHandledWords: []
        };
        renderBookSidebar();
        document.getElementById('daily-task-count').innerText = `今日任务: ${dailyQuota} 词`;

        renderWordList(bookName);
        saveAppData();
    }
    btn.innerText = "打乱顺序并生成任务";
    btn.disabled = false;
});

function renderWordList(bookName) {
    document.getElementById('import-state').style.display = 'none';
    document.getElementById('learning-state').style.display = 'flex';
    document.getElementById('current-book-title').innerText = bookName;
    document.getElementById('daily-task-count').innerText = `今日任务: ${dailyWords.length} 词`;
    
    const container = document.getElementById('word-list-container');
    container.innerHTML = ''; 
    
    dailyWords.forEach((wordData, index) => {
        const wordEl = document.createElement('div');
        const safeWord = escapeHtml(wordData.word);
        const safeTranslation = escapeHtml(cleanTranslation(wordData.translation));
        wordEl.className = 'word-card';
        if (wordData.isReview) wordEl.classList.add('review-word-card');
        wordEl.dataset.index = index; 
        wordEl.innerHTML = `
            ${wordData.isReview ? `<div class="review-badge">复习词 · 首次学习 ${escapeHtml(wordData.firstSeenDate || '未知')}</div>` : ''}
            <div class="word-info" ondblclick="window.open('https://dict.youdao.com/result?word=${encodeURIComponent(wordData.word)}', '_blank')" title="双击查看详细释义">
                <div class="word-en" onclick="event.stopPropagation(); speakWord('${safeWord}')">${safeWord} 🔊</div>
                <div class="word-cn">${safeTranslation}</div>
            </div>
            <div class="word-actions">
                <button class="word-action-btn btn-known" onclick="sortWord(${index}, 'known')">已认识</button>
                <button class="word-action-btn btn-familiar" onclick="sortWord(${index}, 'familiar')">熟悉</button>
                <button class="word-action-btn btn-unfamiliar" onclick="sortWord(${index}, 'unfamiliar')">不熟悉</button>
                ${renderWordFamilyButton(wordData.word)}
            </div>
        `;
        container.appendChild(wordEl);
    });
    renderCompletionActions();
}

function renderCompletionActions() {
    const container = document.getElementById('word-list-container');
    const old = document.getElementById('completion-actions');
    if (old) old.remove();

    const panel = document.createElement('div');
    panel.id = 'completion-actions';
    panel.className = 'completion-actions';
    panel.innerHTML = `
        <div class="completion-pet">🐱</div>
        <div class="completion-title">还想继续练一会儿吗</div>
        <button class="action-outline-btn" id="continue-study-bottom-btn">继续背一组</button>
        <button class="action-primary-btn" id="dictation-bottom-btn">默写已背单词</button>
    `;
    container.appendChild(panel);
    document.getElementById('continue-study-bottom-btn').addEventListener('click', continueStudyGroup);
    document.getElementById('dictation-bottom-btn').addEventListener('click', () => {
        document.getElementById('setup-dictation-btn').click();
    });
}

function syncCurrentBookProgress() {
    if (!currentBook.key) return;
    bookProgress[currentBook.key] = {
        ...currentBook,
        dailyWords: [...dailyWords],
        todayHandledWords: [...todayHandledWords]
    };
    renderBookSidebar();
}

// --- 3. 处理单词分类与加入生词本 ---
window.sortWord = function(wordIndex, category) {
    const wordData = dailyWords[wordIndex];

    // 标记为今天已处理（放入默写基础库）
    const alreadyHandled = todayHandledWords.some(w => w.word === wordData.word);
    if (!alreadyHandled) {
        todayHandledWords.push(wordData);
        // 背单词奖励水滴
        gardenState.water += 1;
        renderGarden();
    }

    // 记录学习历史
    const todayStr = getTodayDateStr();
    if (!studyHistory[todayStr]) studyHistory[todayStr] = [];
    const existsInHistory = studyHistory[todayStr].some(w => w.word === wordData.word);
    if (!existsInHistory) studyHistory[todayStr].push(wordData);
    if (!alreadyHandled) {
        persistStudyRecord(wordData, category);
        scheduleReview(wordData, category);
        updateLearningStats(wordData, category);
    }

    // 如果是不熟悉，按日期加入生词本
    if (category === 'unfamiliar') {
        if (!unfamiliarBook[todayStr]) unfamiliarBook[todayStr] = [];
        const exists = unfamiliarBook[todayStr].find(w => w.word === wordData.word);
        if (!exists) unfamiliarBook[todayStr].push(wordData);
    }

    syncCurrentBookProgress();
    saveAppData();
    renderCompletionActions();

    // UI 反馈
    const cardEl = document.querySelector(`.word-card[data-index="${wordIndex}"]`);
    if(cardEl) cardEl.classList.add('handled');
}

async function continueStudyGroup() {
    if (!currentBook.key) {
        alert('请先选择词库并生成今日任务。');
        return;
    }
    let bookWords = currentBook.words || [];
    if (!bookWords.length) {
        bookWords = shuffleArray(await getVocabularyBook(currentBook.key));
        currentBook.words = bookWords;
    }
    if (!bookWords.length) {
        alert('词库加载失败，无法继续背。');
        return;
    }

    const quota = currentBook.dailyQuota || 20;
    const reviewWords = getTodayReviewWords().filter(item => !dailyWords.some(w => normalizeWord(w.word) === normalizeWord(item.word)));
    let nextWords = bookWords.slice(currentBook.cursor, currentBook.cursor + quota);
    if (nextWords.length === 0) {
        const learned = new Set(dailyWords.map(w => w.word));
        nextWords = bookWords.filter(w => !learned.has(w.word)).slice(0, quota);
        if (nextWords.length === 0) {
            alert('这个词库已经没有新的可追加单词了。');
            return;
        }
        currentBook.cursor = dailyWords.length + nextWords.length;
    } else {
        currentBook.cursor += nextWords.length;
    }

    const existing = new Set(dailyWords.map(w => w.word));
    dailyWords.push(...reviewWords.filter(w => !existing.has(w.word)));
    reviewWords.forEach(w => existing.add(w.word));
    dailyWords.push(...nextWords.filter(w => !existing.has(w.word)));
    renderWordList(currentBook.name || '继续学习');
    syncCurrentBookProgress();
    saveAppData();
}

// --- 4. 查看生词本逻辑 (已移至侧边栏) ---
function renderUnfamiliarModal() {
    const container = document.getElementById('unfamiliar-content');
    container.innerHTML = '';

    if (Object.keys(unfamiliarBook).length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; margin-top:50px;">暂无生词记录，继续保持！</p>';
    } else {
        for (const date in unfamiliarBook) {
            const words = unfamiliarBook[date];
            let listHtml = '';
            words.forEach(w => {
                listHtml += `
                    <div class="unfamiliar-item">
                        <div>
                            <span style="font-weight:bold;">${escapeHtml(w.word)}</span>
                            <span style="color:#666;">${escapeHtml(cleanTranslation(w.translation || ''))}</span>
                        </div>
                        ${renderWordFamilyButton(w.word)}
                    </div>`;
            });
            container.innerHTML += `
                <div class="date-group">
                    <div class="date-header">📅 ${date}</div>
                    ${listHtml}
                </div>
            `;
        }
    }
    window.openModal('unfamiliar-modal');
}

// --- 5. 默写系统核心逻辑 ---
document.getElementById('setup-dictation-btn').addEventListener('click', () => {
    if (todayHandledWords.length === 0) {
        alert("请至少在上方列表中对一个单词进行选项评价后再进行默写！");
        return;
    }
    window.openModal('dictation-setup-modal');
});

window.startDictation = function(mode) {
    currentDictationMode = mode;
    window.closeModal('dictation-setup-modal');
    
    // 组装默写题库：今天背诵的全部 + 以前背诵的随机10个
    let randomPast = shuffleArray(mockPastLearnedWords).slice(0, 10);
    let combinedPool = [...todayHandledWords, ...randomPast];
    
    // 最终打乱顺序，保证出题随机性
    dictationQueue = shuffleArray(combinedPool);
    currentDictationIndex = 0;
    
    document.getElementById('dictation-screen').style.display = 'flex';
    renderDictationCard();
}

function renderDictationCard() {
    const currentWord = dictationQueue[currentDictationIndex];
    const promptEl = document.getElementById('dictation-prompt');
    const inputEl = document.getElementById('dictation-input');
    
    // 重置界面状态
    inputEl.value = '';
    document.getElementById('dictation-answer-area').style.display = 'none';
    document.getElementById('dictation-submit-btn').style.display = 'block';
    document.getElementById('dictation-next-btn').style.display = 'none';
    
    document.getElementById('dictation-progress').innerText = `${currentDictationIndex + 1} / ${dictationQueue.length}`;
    
    if (currentDictationMode === 'hide-cn') {
        // 掩盖中文：提示英文，让用户输入中文
        promptEl.innerText = currentWord.word;
        inputEl.placeholder = "请输入中文释义 (可简写)";
    } else {
        // 掩盖英文：提示中文，让用户输入英文
        promptEl.innerText = currentWord.translation;
        inputEl.placeholder = "请输入英文单词";
    }
}

window.checkDictation = function() {
    const currentWord = dictationQueue[currentDictationIndex];
    const inputVal = document.getElementById('dictation-input').value.trim();
    
    if (!inputVal) return alert('请输入你的答案哦！');
    
    const answerArea = document.getElementById('dictation-answer-area');
    const answerText = document.getElementById('dictation-correct-answer');
    
    // 展示标准答案，供用户自我核对
    answerArea.style.display = 'block';
    if (currentDictationMode === 'hide-cn') {
        answerText.innerText = currentWord.translation;
    } else {
        answerText.innerText = currentWord.word;
    }
    
    // 切换按钮
    document.getElementById('dictation-submit-btn').style.display = 'none';
    document.getElementById('dictation-next-btn').style.display = 'block';
}

window.nextDictation = function() {
    currentDictationIndex++;
    if (currentDictationIndex < dictationQueue.length) {
        renderDictationCard();
    } else {
        alert("🎉 恭喜！本次默写测试已完成！");
        window.exitDictation();
    }
}

window.exitDictation = function() {
    document.getElementById('dictation-screen').style.display = 'none';
}

// --- 6. 听写模式逻辑 ---
async function buildDictateQueue(source) {
    let pool = [];
    if (source === 'today') {
        if (todayHandledWords.length > 0) {
            pool = [...todayHandledWords];
        } else {
            // 如果今日没有，从模拟历史词库取
            pool = shuffleArray(mockPastLearnedWords).slice(0, 20);
        }
    } else {
        const words = await loadVocabularyBook(source);
        pool = shuffleArray(words).slice(0, 20);
    }
    return shuffleArray(pool);
}

function speakWord(word) {
    if (!window.speechSynthesis) {
        alert('您的浏览器不支持语音播放，请使用 Chrome 或 Edge 浏览器。');
        return;
    }
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = 'en-US';
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
}

function renderDictateGame() {
    const word = dictateQueue[currentDictateIndex];
    document.getElementById('dictate-progress-text').innerText = `${currentDictateIndex + 1} / ${dictateQueue.length}`;
    document.getElementById('dictate-input').value = '';
    document.getElementById('dictate-feedback').style.display = 'none';
    document.getElementById('dictate-submit-btn').style.display = 'block';
    document.getElementById('dictate-next-btn').style.display = 'none';
    // 自动播放一次
    setTimeout(() => speakWord(word.word), 300);
}

function showDictateFeedback(isCorrect, correctWord, translation) {
    const fb = document.getElementById('dictate-feedback');
    const icon = document.getElementById('dictate-result-icon');
    const text = document.getElementById('dictate-result-text');
    const correctDiv = document.getElementById('dictate-correct-word');

    fb.style.display = 'block';
    if (isCorrect) {
        fb.className = 'correct';
        icon.innerText = '✅';
        text.innerText = '回答正确！';
        correctDiv.innerText = `${correctWord}  ${translation || ''}`;
    } else {
        fb.className = 'wrong';
        icon.innerText = '❌';
        text.innerText = '回答错误';
        correctDiv.innerText = `正确答案：${correctWord}  ${translation || ''}`;
    }
}

document.getElementById('start-dictate-btn').addEventListener('click', async () => {
    const source = document.getElementById('dictate-book-select').value;
    dictateQueue = await buildDictateQueue(source);
    if (dictateQueue.length === 0) {
        alert('未能加载单词，请检查词库文件是否存在。');
        return;
    }
    currentDictateIndex = 0;
    dictateCorrect = 0;
    dictateWrong = 0;

    document.getElementById('dictate-setup-state').style.display = 'none';
    document.getElementById('dictate-game').style.display = 'flex';
    document.getElementById('dictate-finish').style.display = 'none';
    renderDictateGame();
});

document.getElementById('dictate-play-btn').addEventListener('click', () => {
    if (dictateQueue.length > 0) {
        speakWord(dictateQueue[currentDictateIndex].word);
    }
});

document.getElementById('dictate-submit-btn').addEventListener('click', () => {
    const inputVal = document.getElementById('dictate-input').value.trim().toLowerCase();
    if (!inputVal) return alert('请输入你听到的单词！');
    const currentWord = dictateQueue[currentDictateIndex];
    const isCorrect = inputVal === currentWord.word.toLowerCase();
    if (isCorrect) dictateCorrect++; else dictateWrong++;
    showDictateFeedback(isCorrect, currentWord.word, currentWord.translation);
    document.getElementById('dictate-submit-btn').style.display = 'none';
    document.getElementById('dictate-next-btn').style.display = 'block';
});

document.getElementById('dictate-next-btn').addEventListener('click', () => {
    currentDictateIndex++;
    if (currentDictateIndex < dictateQueue.length) {
        renderDictateGame();
    } else {
        document.getElementById('dictate-game').style.display = 'none';
        document.getElementById('dictate-finish').style.display = 'flex';
        document.getElementById('dictate-correct-count').innerText = dictateCorrect;
        document.getElementById('dictate-wrong-count').innerText = dictateWrong;
    }
});

document.getElementById('dictate-restart-btn').addEventListener('click', async () => {
    const source = document.getElementById('dictate-book-select').value;
    dictateQueue = await buildDictateQueue(source);
    currentDictateIndex = 0;
    dictateCorrect = 0;
    dictateWrong = 0;
    document.getElementById('dictate-finish').style.display = 'none';
    document.getElementById('dictate-game').style.display = 'flex';
    renderDictateGame();
});

document.getElementById('dictate-back-btn').addEventListener('click', () => {
    document.getElementById('dictate-finish').style.display = 'none';
    document.getElementById('dictate-game').style.display = 'none';
    document.getElementById('dictate-setup-state').style.display = 'flex';
});

// --- 7. 能量花园逻辑 ---
function renderGarden() {
    document.getElementById('water-count').innerText = gardenState.water;
    document.getElementById('plant-btn').innerText = `🌱 播种 (${PLANT_COST}💧)`;
    document.getElementById('water-btn').innerText = `💧 浇水/收获 (${WATER_COST}💧)`;
    const grid = document.getElementById('garden-grid');
    grid.innerHTML = '';

    gardenState.pots.forEach((pot, index) => {
        const el = document.createElement('div');
        el.className = 'pot' + (pot.plant ? ' active' : '') + (gardenState.selectedPot === index ? ' selected' : '');
        el.onclick = () => {
            gardenState.selectedPot = index;
            renderGarden();
        };

        if (!pot.plant) {
            el.innerHTML = `<div class="pot-plant">🪹</div><div class="pot-name">空花盆</div>`;
        } else {
            const emoji = PLANT_EMOJIS[pot.plant.type][pot.plant.stage];
            const name = PLANT_TYPES[pot.plant.type];
            const stage = STAGE_NAMES[pot.plant.stage];
            el.innerHTML = `
                <div class="pot-plant">${emoji}</div>
                <div class="pot-name">${name}</div>
                <div class="pot-stage">${stage} (浇${pot.plant.waterCount}/2)</div>
            `;
        }
        grid.appendChild(el);
    });
}

function initPlantSelector() {
    const select = document.getElementById('plant-type-select');
    select.innerHTML = PLANT_TYPES.map((name, index) => `<option value="${index}">${name}</option>`).join('');
}

document.getElementById('plant-btn').addEventListener('click', () => {
    if (gardenState.water < PLANT_COST) {
        alert(`水滴不足！播种需要 ${PLANT_COST} 滴水。`);
        return;
    }
    const emptyIndex = gardenState.pots.findIndex(p => !p.plant);
    if (emptyIndex === -1) {
        alert('没有空花盆了，请先收获或等待植物成长！');
        return;
    }
    gardenState.water -= PLANT_COST;
    const type = Number(document.getElementById('plant-type-select').value || 0);
    gardenState.pots[emptyIndex].plant = { stage: 0, waterCount: 0, type };
    gardenState.selectedPot = emptyIndex;
    saveAppData();
    renderGarden();
});

document.getElementById('water-btn').addEventListener('click', () => {
    const idx = gardenState.selectedPot;
    if (idx < 0 || !gardenState.pots[idx].plant) {
        alert('请先点击选择一个有植物的花盆！');
        return;
    }
    if (gardenState.water < WATER_COST) {
        alert(`水滴不足！浇水需要 ${WATER_COST} 滴水。`);
        return;
    }
    const plant = gardenState.pots[idx].plant;
    if (plant.stage >= 3) {
        gardenState.water -= WATER_COST;
        if (!Array.isArray(gardenState.flowerRoom)) gardenState.flowerRoom = [];
        gardenState.flowerRoom.push({
            type: plant.type,
            name: PLANT_TYPES[plant.type],
            emoji: PLANT_EMOJIS[plant.type][3],
            harvestedAt: getTodayDateStr()
        });
        gardenState.pots[idx].plant = null;
        gardenState.water += HARVEST_REWARD;
        gardenState.selectedPot = -1;
        alert(`🎉 花朵已收入花房，获得 ${HARVEST_REWARD} 滴水奖励！`);
        saveAppData();
        renderGarden();
        return;
    }

    gardenState.water -= WATER_COST;
    plant.waterCount += 1;
    if (plant.waterCount >= 2) {
        plant.stage += 1;
        plant.waterCount = 0;
    }
    saveAppData();
    renderGarden();
});

// --- 8. 侧边栏逻辑 ---
window.toggleSidebar = function() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
}

document.getElementById('menu-btn').addEventListener('click', window.toggleSidebar);

document.getElementById('sidebar-unfamiliar-btn').addEventListener('click', () => {
    window.toggleSidebar();
    renderUnfamiliarModal();
});

document.getElementById('sidebar-stats-btn').addEventListener('click', () => {
    window.toggleSidebar();
    renderStats(7);
    window.openModal('stats-modal');
});

document.getElementById('sidebar-flower-room-btn').addEventListener('click', () => {
    window.toggleSidebar();
    renderFlowerRoom();
    window.openModal('flower-room-modal');
});

function renderFlowerRoom() {
    const container = document.getElementById('flower-room-content');
    const flowers = gardenState.flowerRoom || [];
    if (!flowers.length) {
        container.innerHTML = '<div class="search-empty">花房还空着，等花成熟后收获进来吧。</div>';
        return;
    }
    const grouped = flowers.reduce((acc, flower) => {
        acc[flower.name] = acc[flower.name] || { ...flower, count: 0 };
        acc[flower.name].count += 1;
        return acc;
    }, {});
    container.innerHTML = Object.values(grouped).map(item => `
        <div class="flower-room-item">
            <div class="flower-room-emoji">${escapeHtml(item.emoji)}</div>
            <div>
                <strong>${escapeHtml(item.name)}</strong>
                <p>收藏 ${item.count} 朵 · 最近收获 ${escapeHtml(item.harvestedAt || '')}</p>
            </div>
        </div>
    `).join('');
}

document.querySelectorAll('.stats-range button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.stats-range button').forEach(item => item.classList.remove('active'));
        btn.classList.add('active');
        renderStats(Number(btn.dataset.days));
    });
});

// --- 9. 日历逻辑 ---
document.getElementById('calendar-btn').addEventListener('click', () => {
    renderCalendar();
    window.openModal('calendar-modal');
});

document.getElementById('cal-prev').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
});

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthYear = document.getElementById('cal-month-year');
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();

    monthYear.innerText = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    weekdays.forEach(d => {
        html += `<div class="calendar-weekday">${d}</div>`;
    });

    for (let i = 0; i < firstDay; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasStudy = studyHistory[dateStr] && studyHistory[dateStr].length > 0;
        const cls = hasStudy ? 'calendar-day has-study' : 'calendar-day';
        const dot = hasStudy ? '<div class="study-dot"></div>' : '';
        html += `<div class="${cls}" onclick="${hasStudy ? `showDayWords('${dateStr}')` : ''}">${day}${dot}</div>`;
    }

    grid.innerHTML = html;
}

window.showDayWords = function(dateStr) {
    const words = studyHistory[dateStr] || [];
    document.getElementById('day-words-title').innerText = `📅 ${dateStr} 学习记录`;
    const container = document.getElementById('day-words-content');
    if (words.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; margin-top:50px;">当日无学习记录</p>';
    } else {
        container.innerHTML = words.map(w => `
            <div class="unfamiliar-item">
                <div>
                    <span style="font-weight:bold;">${escapeHtml(w.word)}</span>
                    <span style="color:#666;">${escapeHtml(cleanTranslation(w.translation || ''))}</span>
                </div>
                ${renderWordFamilyButton(w.word)}
            </div>
        `).join('');
    }
    window.openModal('day-words-modal');
}

function renderStats(days = 7) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    const dateKeys = getDateRange(start.toISOString().split('T')[0], end.toISOString().split('T')[0]);
    const rows = dateKeys.map(date => {
        const historyWords = studyHistory[date] || [];
        const stat = learningStats[date] || {};
        const learned = stat.learned ?? historyWords.filter(w => !w.isReview).length;
        const review = stat.review ?? historyWords.filter(w => w.isReview).length;
        const target = stat.target || currentBook.dailyQuota || 0;
        const seconds = stat.seconds || 0;
        return { date, learned, review, total: learned + review, target, seconds, completed: target > 0 && learned + review >= target };
    });

    const total = rows.reduce((sum, item) => sum + item.total, 0);
    const reviewTotal = rows.reduce((sum, item) => sum + item.review, 0);
    const completedDays = rows.filter(item => item.completed).length;
    const minutes = Math.round(rows.reduce((sum, item) => sum + item.seconds, 0) / 60);
    const maxTotal = Math.max(1, ...rows.map(item => item.total));

    const bars = rows.map(item => {
        const learnedHeight = Math.max(2, Math.round((item.learned / maxTotal) * 120));
        const reviewHeight = item.review ? Math.max(2, Math.round((item.review / maxTotal) * 120)) : 0;
        const day = item.date.slice(5).replace('-', '/');
        return `
            <div class="bar-day" title="${item.date}：学习 ${item.learned}，复习 ${item.review}">
                ${item.completed ? '<div class="bar-complete">✓</div>' : ''}
                <div class="bar-stack" style="height:${Math.max(4, learnedHeight + reviewHeight)}px">
                    <div class="bar-review" style="height:${reviewHeight}px"></div>
                    <div class="bar-learned" style="height:${learnedHeight}px"></div>
                </div>
                <div class="bar-label">${day}</div>
            </div>
        `;
    }).join('');

    const maxSeconds = Math.max(1, ...rows.map(item => item.seconds));
    const timeRows = rows.map(item => `
        <div class="time-row">
            <span>${item.date.slice(5).replace('-', '/')}</span>
            <div class="time-bar-track"><div class="time-bar" style="width:${Math.round((item.seconds / maxSeconds) * 100)}%"></div></div>
            <span>${Math.round(item.seconds / 60)}分</span>
        </div>
    `).join('');

    document.getElementById('stats-content').innerHTML = `
        <div class="stats-summary">
            <div class="stats-summary-card"><strong>${total}</strong><span>学习/复习总词数</span></div>
            <div class="stats-summary-card"><strong>${reviewTotal}</strong><span>复习词数</span></div>
            <div class="stats-summary-card"><strong>${completedDays}</strong><span>完成任务天数</span></div>
            <div class="stats-summary-card"><strong>${minutes}</strong><span>学习分钟</span></div>
        </div>
        <div class="stats-section-title">词数柱状图（绿色学习，橙色复习，✓ 表示完成当日任务）</div>
        <div class="bar-chart">${bars}</div>
        <div class="stats-section-title">学习时长分布</div>
        ${timeRows || '<div class="search-empty">暂无学习时长记录</div>'}
    `;
}

// --- 10. 专注模式逻辑 ---
document.getElementById('focus-mode-btn').addEventListener('click', () => {
    if (dailyWords.length === 0) {
        alert('请先生成今日学习任务！');
        return;
    }
    focusQueue = shuffleArray([...dailyWords]);
    focusIndex = 0;
    focusFlipped = false;
    renderFocusCard();
    document.getElementById('focus-overlay').classList.add('active');
});

document.getElementById('focus-exit-btn').addEventListener('click', () => {
    document.getElementById('focus-overlay').classList.remove('active');
});

const focusCard = document.getElementById('focus-card');
focusCard.addEventListener('click', () => {
    focusFlipped = !focusFlipped;
    focusCard.classList.toggle('is-flipped', focusFlipped);
    document.getElementById('focus-actions').classList.toggle('show', focusFlipped);
});

document.getElementById('focus-btn-known').addEventListener('click', (e) => {
    e.stopPropagation();
    const wordData = focusQueue[focusIndex];
    if (wordData) {
        persistStudyRecord(wordData, 'known');
        scheduleReview(wordData, 'known');
        updateLearningStats(wordData, 'known');
    }
    nextFocusCard();
});

document.getElementById('focus-btn-unknown').addEventListener('click', (e) => {
    e.stopPropagation();
    const wordData = focusQueue[focusIndex];
    const todayStr = getTodayDateStr();
    if (!unfamiliarBook[todayStr]) unfamiliarBook[todayStr] = [];
    const exists = unfamiliarBook[todayStr].find(w => w.word === wordData.word);
    if (!exists) unfamiliarBook[todayStr].push(wordData);
    scheduleReview(wordData, 'unfamiliar');
    updateLearningStats(wordData, 'unfamiliar');
    saveAppData();
    persistStudyRecord(wordData, 'unfamiliar');
    nextFocusCard();
});

function renderFocusCard() {
    const wordData = focusQueue[focusIndex];
    focusFlipped = false;
    focusCard.classList.remove('is-flipped');
    document.getElementById('focus-actions').classList.remove('show');
    document.getElementById('focus-progress').innerText = `${focusIndex + 1} / ${focusQueue.length}`;
    document.getElementById('focus-word').innerText = wordData.word;
    document.getElementById('focus-phonetic').innerText = wordData.phonetic || '';
    document.getElementById('focus-word-back').innerText = wordData.word;
    document.getElementById('focus-translation').innerText = wordData.translation || '暂无释义';
}

function nextFocusCard() {
    focusIndex++;
    if (focusIndex < focusQueue.length) {
        renderFocusCard();
    } else {
        alert('🎉 专注模式完成！');
        document.getElementById('focus-overlay').classList.remove('active');
    }
}
