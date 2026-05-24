// 文件路径: modules/study.js

/**
 * 核心功能：读取真实的 JSON 词库数据
 * @param {string} bookKey - 词库的文件名（如 'cet4'）
 */
export async function loadVocabularyBook(bookKey) {
    try {
        const response = await fetch(`./data/${bookKey}.json`);
        if (!response.ok) throw new Error(`无法读取文件: ${bookKey}.json`);
        
        const words = await response.json();
        console.log(`✅ 成功读取模块：${bookKey}，包含 ${words.length} 个单词！`);
        return words; 
    } catch (error) {
        console.error("❌ 词库录入失败:", error);
        alert("找不到词库文件，请确保 data 文件夹中有对应的 json 文件");
        return []; 
    }
}