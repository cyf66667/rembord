// --- 1. 全局数据与状态 ---
let userData = { phone: '未绑定', nickname: '同学', avatarUrl: '' };
let cropper;
let allWords = [];
let dailyWords = [];
let currentIndex = 0;
let isFlipped = false;

// --- 2. 登录与设置流程 ---
function handleLogin() {
    if(document.getElementById('phone').value) userData.phone = document.getElementById('phone').value;
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('setup-screen').classList.add('active');
}

// 裁剪头像逻辑
document.getElementById('image-upload').addEventListener('change', function(e) {
    if (!e.target.files[0]) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        document.getElementById('image-to-crop').src = event.target.result;
        document.getElementById('crop-modal').classList.add('active');
        if (cropper) cropper.destroy();
        cropper = new Cropper(document.getElementById('image-to-crop'), { aspectRatio: 1, viewMode: 1, dragMode: 'move', background: false, guides: false });
    };
    reader.readAsDataURL(e.target.files[0]);
    e.target.value = ''; 
});

function cancelCrop() { document.getElementById('crop-modal').classList.remove('active'); }
function confirmCrop() {
    if (!cropper) return;
    userData.avatarUrl = cropper.getCroppedCanvas({ width: 200, height: 200 }).toDataURL('image/jpeg');
    document.getElementById('avatar-preview').style.backgroundImage = `url(${userData.avatarUrl})`;
    cancelCrop();
}

function startApp() {
    if(document.getElementById('nickname').value) userData.nickname = document.getElementById('nickname').value;
    const bg = userData.avatarUrl ? `url(${userData.avatarUrl})` : 'none';
    
    // 同步数据到各个角落
    document.getElementById('sidebar-avatar').style.backgroundImage = bg;
    document.getElementById('info-avatar').style.backgroundImage = bg;
    document.getElementById('info-name').innerText = userData.nickname;
    document.getElementById('info-phone').innerText = `绑定的手机号: ${userData.phone}`;

    document.getElementById('setup-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
}

// --- 3. 界面交互与弹窗 ---
function switchTab(tabId, element) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    element.classList.add('active');
}
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function toggleZenMode() { document.getElementById('app').classList.toggle('zen-mode'); }

// --- 4. 真实词库拉取逻辑 ---
function loadRealBookData() {
    const bookKey = document.getElementById('book-select').value;
    if (!bookKey) return alert('请先选择一个词库！');
    
    const btn = document.getElementById('confirm-book-btn');
    btn.innerText = '正在读取...';

    // 去本地服务器请求同目录下的 JSON 文件
    fetch(`${bookKey}.json`)
        .then(res => res.json())
        .then(data => {
            allWords = data;
            const bookName = document.getElementById('book-select').options[document.getElementById('book-select').selectedIndex].text.split(' ')[0];
            
            // 左侧加一个图标
            const list = document.getElementById('book-list');
            const newItem = document.createElement('div');
            newItem.className = 'book-item active';
            newItem.innerText = bookName.substring(0,2);
            Array.from(list.getElementsByClassName('book-item')).forEach(i => i.classList.remove('active'));
            list.appendChild(newItem);

            // 切换右侧显示
            document.getElementById('empty-state').style.display = 'none';
            document.getElementById('learning-state').style.display = 'flex';
            document.getElementById('current-book-title').innerText = bookName;
            document.getElementById('book-meta').innerText = `词库加载成功！总计 ${allWords.length} 词`;
            
            closeModal('add-book-modal');
            btn.innerText = '确认读取并导入';
        })
        .catch(err => {
            alert('读取失败！请确保你使用 python -m http.server 8000 运行了本地服务器，并且 JSON 文件存在。\n' + err);
            btn.innerText = '确认读取并导入';
        });
}

// --- 5. 沉浸式背单词逻辑 ---
function startFlashcards() {
    if(allWords.length === 0) return alert('请先导入词库！');
    
    const amount = parseInt(document.getElementById('daily-amount').value) || 20;
    dailyWords = allWords.slice(0, amount); 
    currentIndex = 0;

    document.getElementById('main-screen').classList.remove('active');
    document.getElementById('flashcard-screen').classList.add('active');
    
    document.getElementById('flashcard').style.display = 'block';
    document.getElementById('finish-state').style.display = 'none';
    renderWord();
}

function renderWord() {
    const wordData = dailyWords[currentIndex];
    isFlipped = false;
    document.getElementById('flashcard').classList.remove('is-flipped');
    document.getElementById('action-area').classList.remove('show');

    document.getElementById('word-en').innerText = wordData.word;
    document.getElementById('word-phonetic').innerText = wordData.phonetic ? `[ ${wordData.phonetic} ]` : '';
    document.getElementById('word-en-back').innerText = wordData.word;
    document.getElementById('word-translation').innerText = wordData.translation;

    const progress = ((currentIndex) / dailyWords.length) * 100;
    document.getElementById('progress-fill').style.width = `${progress}%`;
    document.getElementById('progress-text').innerText = `${currentIndex}/${dailyWords.length}`;
}

function flipCard() {
    if (isFlipped) return; 
    isFlipped = true;
    document.getElementById('flashcard').classList.add('is-flipped');
    setTimeout(() => { document.getElementById('action-area').classList.add('show'); }, 300);
}

function nextWord(isKnown) {
    currentIndex++;
    if (currentIndex < dailyWords.length) {
        renderWord();
    } else {
        document.getElementById('progress-fill').style.width = '100%';
        document.getElementById('progress-text').innerText = `${dailyWords.length}/${dailyWords.length}`;
        document.getElementById('flashcard').style.display = 'none';
        document.getElementById('action-area').classList.remove('show');
        document.getElementById('finish-state').style.display = 'flex';
    }
}

function exitStudy() {
    document.getElementById('flashcard-screen').classList.remove('active');
    document.getElementById('main-screen').classList.add('active');
}