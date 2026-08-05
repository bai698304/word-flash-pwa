"""
通用同步脚本：扫描 words/ 下所有 .md 词库文件，生成 manifest.json，自动 git push。
用法：新增 Markdown 文档到 words/ 后 → 双击运行本脚本。
"""

import json
import os
import subprocess
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORDS_DIR = os.path.join(SCRIPT_DIR, "words")
MANIFEST_FILE = os.path.join(WORDS_DIR, "manifest.json")


def scan_words_dir():
    """扫描 words/ 目录下所有 .md 文件，生成清单"""
    if not os.path.isdir(WORDS_DIR):
        print("words/ 目录不存在")
        return None

    md_files = []
    for f in sorted(os.listdir(WORDS_DIR)):
        if f.endswith(".md"):
            md_files.append(f)

    if not md_files:
        print("words/ 下没有 .md 文件")
        return None

    manifest = {
        "version": datetime.now().isoformat(),
        "files": md_files
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"已生成 manifest.json：{len(md_files)} 个词库文件")
    for mf in md_files:
        print(f"  - {mf}")
    return manifest


def git_commit_and_push():
    try:
        subprocess.run(["git", "add", "words/"], cwd=SCRIPT_DIR, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-m", f"sync: update word manifest {datetime.now().strftime('%m-%d %H:%M')}"],
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
    manifest = scan_words_dir()
    if manifest is None:
        input("\n按回车退出...")
        return

    print()
    git_commit_and_push()

    input("\n按回车退出...")


if __name__ == "__main__":
    main()
