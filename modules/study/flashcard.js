// 文件路径: modules/study/flashcard.js

export function initFlashcards(wordList, onComplete) {
    if (!wordList || wordList.length === 0) return;

    // 内部状态
    let currentIndex = 0;
    let isFlipped = false;
    
    // 获取 DOM 元素
    const cardEl = document.getElementById('word-card');
    const actionsEl = document.getElementById('card-actions');
    const progressEl = document.getElementById('study-progress');

    // 渲染单词的局部函数
    function renderWord() {
        const wordData = wordList[currentIndex];
        
        // 重置为正面，隐藏按钮
        isFlipped = false;
        cardEl.classList.remove('is-flipped');
        actionsEl.classList.remove('show');

        // 填充数据
        document.getElementById('fc-word').innerText = wordData.word;
        document.getElementById('fc-phonetic').innerText = wordData.phonetic ? `[ ${wordData.phonetic} ]` : '';
        document.getElementById('fc-word-back').innerText = wordData.word;
        document.getElementById('fc-translation').innerText = wordData.translation;

        // 更新进度条文字
        progressEl.innerText = `${currentIndex + 1} / ${wordList.length}`;
    }

    // 绑定卡片翻转事件
    cardEl.addEventListener('click', () => {
        if (isFlipped) return; // 已经翻转就不管了
        isFlipped = true;
        cardEl.classList.add('is-flipped');
        
        // 等翻转动画播一半，展示底部按钮
        setTimeout(() => {
            actionsEl.classList.add('show');
        }, 300);
    });

    // 绑定认识/不认识按钮事件
    const handleNext = () => {
        currentIndex++;
        if (currentIndex < wordList.length) {
            renderWord();
        } else {
            alert('🎉 恭喜！今日单词已全部背完！');
            if(onComplete) onComplete(); // 通知外部已经背完了
        }
    };

    document.getElementById('btn-known').addEventListener('click', handleNext);
    document.getElementById('btn-unknown').addEventListener('click', handleNext);

    // 退出按钮事件
    document.getElementById('exit-study-btn').addEventListener('click', () => {
        if(confirm('背词进度将丢失，确认退出吗？')) {
            if(onComplete) onComplete(); 
        }
    });

    // 初始化第一张词卡
    renderWord();
}