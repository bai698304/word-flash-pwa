"""
合并手机导出的进度备份，生成统一进度文件。
用法：把 word-flash-backup-*.json 拖入项目根目录 → 双击运行本脚本。
"""

import json
import os
import glob
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORDS_DIR = os.path.join(SCRIPT_DIR, "words")
OUTPUT_FILE = os.path.join(WORDS_DIR, "progress.json")

def main():
    # 查找所有备份文件
    backup_files = glob.glob(os.path.join(SCRIPT_DIR, "word-flash-backup-*.json"))
    if not backup_files:
        print("未找到任何 word-flash-backup-*.json 文件，请先将备份文件拖入项目文件夹。")
        input("\n按回车退出...")
        return

    print(f"找到 {len(backup_files)} 个备份文件：")
    for f in backup_files:
        print(f"  - {os.path.basename(f)}")

    # 合并：同 id 取 lastReviewed 最新的
    merged = {}
    for fpath in backup_files:
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)
        for item in data:
            wid = item.get("id")
            if not wid:
                continue
            if wid not in merged or (
                item.get("lastReviewed")
                and (not merged[wid].get("lastReviewed") or item["lastReviewed"] > merged[wid]["lastReviewed"])
            ):
                merged[wid] = item

    # 打包输出
    result = {
        "version": datetime.now().isoformat(),
        "wordCount": len(merged),
        "words": list(merged.values()),
    }

    os.makedirs(WORDS_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n合并完成：{len(merged)} 个词条 → {OUTPUT_FILE}")

    # 清理已处理的备份文件
    for fpath in backup_files:
        os.remove(fpath)
        print(f"已清理: {os.path.basename(fpath)}")

    input("\n按回车退出...")

if __name__ == "__main__":
    main()
