import { loadVocabularyBook } from './modules/study/study.js';

let userData = { phone: '', nickname: '同学' };
let dailyWords = []; // 今天展示的词汇
let todayHandledWords = []; // 今天用户点击过选项的词汇（作为默写基础）

// 模拟的“以前背诵的单词库” (用于抽取10个随机词)
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

// 默写测试全局状态
let dictationQueue = [];
let currentDictationIndex = 0;
let currentDictationMode = ''; // 'hide-cn' 掩盖中文，'hide-en' 掩盖英文

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
    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
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
    if(!todayHandledWords.includes(wordData)) {
        todayHandledWords.push(wordData);
    }
    
    // 如果是不熟悉，按日期加入生词本
    if (category === 'unfamiliar') {
        const todayStr = getTodayDateStr();
        if (!unfamiliarBook[todayStr]) unfamiliarBook[todayStr] = [];
        
        // 避免重复添加
        const exists = unfamiliarBook[todayStr].find(w => w.word === wordData.word);
        if (!exists) unfamiliarBook[todayStr].push(wordData);
    }
    
    // UI 反馈
    const cardEl = document.querySelector(`.word-card[data-index="${wordIndex}"]`);
    if(cardEl) cardEl.classList.add('handled');
}

// --- 4. 查看生词本逻辑 ---
document.getElementById('view-unfamiliar-btn').addEventListener('click', () => {
    const container = document.getElementById('unfamiliar-content');
    container.innerHTML = '';
    
    if (Object.keys(unfamiliarBook).length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; margin-top:50px;">暂无生词记录，继续保持！</p>';
    } else {
        // 按日期遍历渲染
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
});

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