"""
合并手机导出的进度备份，生成统一进度文件，自动 git push 到 GitHub Pages。
用法：把 word-flash-backup-*.json 拖入项目根目录 → 双击运行本脚本。
"""

import json
import os
import glob
import subprocess
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORDS_DIR = os.path.join(SCRIPT_DIR, "words")
OUTPUT_FILE = os.path.join(WORDS_DIR, "progress.json")


def git_commit_and_push():
    """提交 progress.json 并推送到 GitHub"""
    try:
        # 先拉取远程更新，避免 push 时冲突
        print("拉取远程更新...")
        subprocess.run(["git", "pull", "--rebase", "origin", "main"],
                       cwd=SCRIPT_DIR, check=True)
    except subprocess.CalledProcessError as e:
        print(f"警告: 拉取远程更新失败，继续尝试提交。错误: {e}")

    try:
        subprocess.run(["git", "add", "words/progress.json"], cwd=SCRIPT_DIR, check=True)
        subprocess.run(["git", "commit", "-m", f"sync: merge phone progress {datetime.now().strftime('%m-%d %H:%M')}"],
                       cwd=SCRIPT_DIR, check=True)
        subprocess.run(["git", "push"], cwd=SCRIPT_DIR, check=True)
        print("已推送到 GitHub Pages（约 1 分钟后生效）")
        return True
    except subprocess.CalledProcessError as e:
        if "nothing to commit" in str(e):
            print("无变更需要推送")
            return True
        print(f"Git 操作失败:\n{e}")
        return False


def main():
    backup_files = glob.glob(os.path.join(SCRIPT_DIR, "word-flash-backup-*.json"))
    if not backup_files:
        print("未找到任何 word-flash-backup-*.json 文件，请先将备份文件拖入项目文件夹。")
        input("\n按回车退出...")
        return

    print(f"找到 {len(backup_files)} 个备份文件：")
    for f in backup_files:
        print(f"  - {os.path.basename(f)}")

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

    result = {
        "version": datetime.now().isoformat(),
        "wordCount": len(merged),
        "words": list(merged.values()),
    }

    os.makedirs(WORDS_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n合并完成：{len(merged)} 个词条 → {OUTPUT_FILE}")

    # 保留备份文件，不自动删除
    print(f"\n保留 {len(backup_files)} 个备份文件，未删除。")

    # 自动 push 到 GitHub
    print()
    git_commit_and_push()

    input("\n按回车退出...")


if __name__ == "__main__":
    main()
