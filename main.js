import { loadVocabularyBook } from './modules/study/study.js';

const STORAGE_KEY = 'rembord_data';

let userData = { phone: '', nickname: '同学' };
let dailyWords = []; // 今天展示的词汇
let todayHandledWords = []; // 今天用户点击过选项的词汇（作为默写基础）

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
let currentCalendarDate = new Date();

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
    selectedPot: -1
};
const PLANT_TYPES = ['🌻 向日葵', '🌹 玫瑰', '🌷 郁金香', '🌼 雏菊'];
const PLANT_EMOJIS = [
    ['🌰', '🌱', '🌿', '🌻'],
    ['🌰', '🌱', '🌿', '🌹'],
    ['🌰', '🌱', '🌿', '🌷'],
    ['🌰', '🌱', '🌿', '🌼']
];
const STAGE_NAMES = ['种子', '发芽', '幼苗', '开花'];

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

// --- 持久化 ---
function saveAppData() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            unfamiliarBook,
            todayHandledWords,
            dailyWords,
            userData,
            garden: gardenState,
            studyHistory
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
        if (data.userData) userData = { ...userData, ...data.userData };
        if (data.garden) {
            gardenState = { ...gardenState, ...data.garden };
            if (!Array.isArray(gardenState.pots)) gardenState.pots = [];
        }
        if (data.studyHistory) studyHistory = data.studyHistory;
    } catch (e) { console.error('读取失败', e); }
}

// 弹窗控制绑定为全局函数，供 HTML 调用
window.closeModal = function(id) { document.getElementById(id).classList.remove('active'); }
window.openModal = function(id) { document.getElementById(id).classList.add('active'); }

// --- 1. 登录与初始化 ---
document.getElementById('login-btn').addEventListener('click', () => {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('setup-screen').classList.add('active');
    
    const todayStr = getTodayDateStr();
    const nextMonth = new Date(); nextMonth.setDate(new Date().getDate() + 30);
    document.getElementById('start-date').value = todayStr;
    document.getElementById('end-date').value = nextMonth.toISOString().split('T')[0];
});

document.getElementById('setup-btn').addEventListener('click', () => {
    const nick = document.getElementById('nickname').value.trim();
    if (nick) userData.nickname = nick;
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
    loadAppData();
    if (gardenState.pots.length === 0) {
        gardenState.pots = Array.from({ length: 6 }, () => ({ plant: null }));
        saveAppData();
    }
    renderGarden();
    document.getElementById('sidebar-nickname').innerText = userData.nickname;
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

// --- 2. 词库拉取与任务生成 ---
document.getElementById('import-btn').addEventListener('click', async () => {
    const bookSelect = document.getElementById('book-select');
    const bookKey = bookSelect.value;
    if (!bookKey) return alert('请先选择一个词库！');
    
    const btn = document.getElementById('import-btn');
    btn.innerText = "正在打乱数据...";
    btn.disabled = true;

    let fullWordList = await loadVocabularyBook(bookKey);
    if (fullWordList.length > 0) {
        fullWordList = shuffleArray(fullWordList);
        const dailyQuota = 20; // 为演示写死 20 个
        dailyWords = fullWordList.slice(0, dailyQuota);
        todayHandledWords = []; // 重置今日已处理

        const bookName = bookSelect.options[bookSelect.selectedIndex].text.split(' ')[0];
        document.getElementById('book-list').innerHTML = `<div class="book-item active">${bookName.substring(0,2)}</div>`;
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
    
    const container = document.getElementById('word-list-container');
    container.innerHTML = ''; 
    
    dailyWords.forEach((wordData, index) => {
        const wordEl = document.createElement('div');
        wordEl.className = 'word-card';
        wordEl.dataset.index = index; 
        wordEl.innerHTML = `
            <div class="word-info">
                <div class="word-en">${wordData.word}</div>
                <div class="word-cn">${wordData.translation || '暂无'}</div>
            </div>
            <div class="word-actions">
                <button class="word-action-btn btn-known" onclick="sortWord(${index}, 'known')">已认识</button>
                <button class="word-action-btn btn-familiar" onclick="sortWord(${index}, 'familiar')">熟悉</button>
                <button class="word-action-btn btn-unfamiliar" onclick="sortWord(${index}, 'unfamiliar')">不熟悉</button>
            </div>
        `;
        container.appendChild(wordEl);
    });
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

    // 如果是不熟悉，按日期加入生词本
    if (category === 'unfamiliar') {
        if (!unfamiliarBook[todayStr]) unfamiliarBook[todayStr] = [];
        const exists = unfamiliarBook[todayStr].find(w => w.word === wordData.word);
        if (!exists) unfamiliarBook[todayStr].push(wordData);
    }

    saveAppData();

    // UI 反馈
    const cardEl = document.querySelector(`.word-card[data-index="${wordIndex}"]`);
    if(cardEl) cardEl.classList.add('handled');
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
                listHtml += `<div class="unfamiliar-item"><span style="font-weight:bold;">${w.word}</span><span style="color:#666;">${w.translation}</span></div>`;
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

document.getElementById('plant-btn').addEventListener('click', () => {
    if (gardenState.water < 5) {
        alert('水滴不足！每学一个单词可获得 1 滴水。');
        return;
    }
    const emptyIndex = gardenState.pots.findIndex(p => !p.plant);
    if (emptyIndex === -1) {
        alert('没有空花盆了，请先收获或等待植物成长！');
        return;
    }
    gardenState.water -= 5;
    const type = Math.floor(Math.random() * PLANT_TYPES.length);
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
    if (gardenState.water < 3) {
        alert('水滴不足！每学一个单词可获得 1 滴水。');
        return;
    }
    const plant = gardenState.pots[idx].plant;
    if (plant.stage >= 3) {
        alert('这株植物已经开花了，可以收获获得奖励！');
        // 收获：移除植物，返还水滴，奖励额外水滴
        gardenState.pots[idx].plant = null;
        gardenState.water += 8; // 返还3 + 奖励5
        gardenState.selectedPot = -1;
        saveAppData();
        renderGarden();
        return;
    }

    gardenState.water -= 3;
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
                <span style="font-weight:bold;">${w.word}</span>
                <span style="color:#666;">${w.translation || ''}</span>
            </div>
        `).join('');
    }
    window.openModal('day-words-modal');
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
    nextFocusCard();
});

document.getElementById('focus-btn-unknown').addEventListener('click', (e) => {
    e.stopPropagation();
    const wordData = focusQueue[focusIndex];
    const todayStr = getTodayDateStr();
    if (!unfamiliarBook[todayStr]) unfamiliarBook[todayStr] = [];
    const exists = unfamiliarBook[todayStr].find(w => w.word === wordData.word);
    if (!exists) unfamiliarBook[todayStr].push(wordData);
    saveAppData();
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