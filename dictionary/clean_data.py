import csv
import json
import sys
import io

# 强制终端使用 UTF-8 输出，解决 Windows 下的乱码问题
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf8')

target_books = {
    'cet4': [],
    'cet6': [],
    'ielts': [],
    'kaoyan': [] 
}

print("开始读取总词库并进行筛选，这可能需要几秒钟，请稍候...")

try:
    # 读取真实文件
    with open('ecdict.csv', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        
        for row in reader:
            # 兼容性处理：防止某些空行报错
            if not row or 'tag' not in row:
                continue
                
            tag_string = row.get('tag', '') 
            
            word_data = {
                'word': row.get('word', ''),
                'phonetic': row.get('phonetic', ''),
                'translation': row.get('translation', '')
            }
            
            if 'cet4' in tag_string:
                target_books['cet4'].append(word_data)
            if 'cet6' in tag_string:
                target_books['cet6'].append(word_data)
            if 'ielts' in tag_string:
                target_books['ielts'].append(word_data)
            if 'ky' in tag_string:
                target_books['kaoyan'].append(word_data)

    for book_name, words in target_books.items():
        output_filename = f'{book_name}.json'
        with open(output_filename, 'w', encoding='utf-8') as out_f:
            json.dump(words, out_f, ensure_ascii=False, indent=2)
        print(f"✅ 成功导出【{book_name}】词库，共包含 {len(words)} 个单词！")

    print("🎉 所有真实词库数据清洗并导出完毕！快去看看你的 JSON 文件吧！")

except FileNotFoundError:
    print("❌ 报错：找不到 'ecdict.csv' 文件！请确保它和这个 python 脚本放在同一个文件夹里！")