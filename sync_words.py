"""
通用同步脚本：从"每日单词背诵"目录拷贝 Markdown 词库 → word-flash-pwa/words/ → 生成 manifest → git push。
用法：在"每日单词背诵"下新增/修改 Markdown 文档后 → 双击运行本脚本。
"""

import json
import os
import shutil
import subprocess
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORDS_DIR = os.path.join(SCRIPT_DIR, "words")
MANIFEST_FILE = os.path.join(WORDS_DIR, "manifest.json")

# 用户的原始词库目录
SOURCE_DIR = r"D:\obsidian\vault\英语学习\每日单词背诵"


def sync_from_source():
    """从每日单词背诵目录拷贝所有 .md 到 words/"""
    if not os.path.isdir(SOURCE_DIR):
        print(f"源目录不存在: {SOURCE_DIR}")
        return None

    os.makedirs(WORDS_DIR, exist_ok=True)

    # 收集源目录所有 .md 文件
    src_md_files = []
    for f in sorted(os.listdir(SOURCE_DIR)):
        if f.endswith(".md"):
            src_md_files.append(f)

    if not src_md_files:
        print(f"源目录下没有 .md 文件: {SOURCE_DIR}")
        return None

    print(f"从 {SOURCE_DIR} 同步 {len(src_md_files)} 个词库文件：")
    for f in src_md_files:
        src = os.path.join(SOURCE_DIR, f)
        dst = os.path.join(WORDS_DIR, f)
        shutil.copy2(src, dst)
        print(f"  {f} → words/{f}")

    # 生成 manifest
    manifest = {
        "version": datetime.now().isoformat(),
        "files": src_md_files
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n已生成 manifest.json（{len(src_md_files)} 个文件）")
    return manifest


def git_commit_and_push():
    try:
        subprocess.run(["git", "add", "words/"], cwd=SCRIPT_DIR, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", f"sync: update words {datetime.now().strftime('%m-%d %H:%M')}"],
                       cwd=SCRIPT_DIR, check=True, capture_output=True)
        subprocess.run(["git", "push"], cwd=SCRIPT_DIR, check=True, capture_output=True)
        print("已推送到 GitHub Pages（约 1 分钟后生效）")
        return True
    except subprocess.CalledProcessError as e:
        err = e.stderr.decode() if e.stderr else str(e)
        if "nothing to commit" in err:
            print("无变更需要推送")
            return True
        print(f"Git 操作失败:\n{err}")
        return False


def main():
    manifest = sync_from_source()
    if manifest is None:
        input("\n按回车退出...")
        return

    print()
    git_commit_and_push()

    input("\n按回车退出...")


if __name__ == "__main__":
    main()
