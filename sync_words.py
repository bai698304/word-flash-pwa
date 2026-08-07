"""
通用同步脚本：从"每日单词背诵"目录拷贝 Markdown 词库 → word-flash-pwa/words/ → 生成 manifest → git push。
用法：在"每日单词背诵"下新增/修改 Markdown 文档后 → 双击运行本脚本。
"""

import hashlib
import json
import os
import re
import shutil
import subprocess
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WORDS_DIR = os.path.join(SCRIPT_DIR, "words")
MANIFEST_FILE = os.path.join(WORDS_DIR, "manifest.json")

# 用户的原始词库目录
SOURCE_DIR = r"D:\obsidian\vault\英语学习\每日单词背诵"

# 需要过滤的文件名模式：考研阅读真题译文（如 2026-text-1-translation.md）
EXCLUDE_PATTERN = re.compile(r"text.*translation", re.IGNORECASE)


def should_exclude(filename):
    """返回 True 表示该文件应被过滤"""
    return bool(EXCLUDE_PATTERN.search(filename))


def cleanup_orphaned_files(new_files):
    """
    清理 words/ 中已被源目录删除或新规则过滤的文件。
    只触碰旧 manifest 中记录过的文件，不动手动投放的文件（如 sample.md）。
    """
    if not os.path.exists(MANIFEST_FILE):
        return  # 首次运行，无旧记录

    try:
        with open(MANIFEST_FILE, "r", encoding="utf-8") as f:
            old_manifest = json.load(f)
        old_files = set(old_manifest.get("files", []))
    except (json.JSONDecodeError, KeyError, TypeError):
        print("[警告] manifest.json 格式异常，跳过清理")
        return

    new_set = set(new_files)
    to_remove = old_files - new_set

    if not to_remove:
        return

    print(f"\n清理 {len(to_remove)} 个已移除的文件：")
    for f in sorted(to_remove):
        path = os.path.join(WORDS_DIR, f)
        if not os.path.exists(path):
            continue
        try:
            os.remove(path)
            print(f"  [删除] words/{f}")
        except OSError as e:
            print(f"  [删除失败] words/{f}: {e}")


def sync_from_source():
    """从每日单词背诵目录拷贝 .md 到 words/，自动过滤译文等非词库文件"""
    if not os.path.isdir(SOURCE_DIR):
        print(f"源目录不存在: {SOURCE_DIR}")
        return None

    os.makedirs(WORDS_DIR, exist_ok=True)

    # 收集源目录所有 .md 文件，过滤掉译文
    src_md_files = []
    excluded_files = []
    for f in sorted(os.listdir(SOURCE_DIR)):
        if f.endswith(".md"):
            if should_exclude(f):
                excluded_files.append(f)
            else:
                src_md_files.append(f)

    if excluded_files:
        print(f"已过滤 {len(excluded_files)} 个非词库文件：")
        for f in excluded_files:
            print(f"  [跳过] {f}")

    if not src_md_files:
        print(f"源目录下没有可同步的词库文件: {SOURCE_DIR}")
        return None

    print(f"\n从 {SOURCE_DIR} 同步 {len(src_md_files)} 个词库文件：")
    for f in src_md_files:
        src = os.path.join(SOURCE_DIR, f)
        dst = os.path.join(WORDS_DIR, f)
        shutil.copy2(src, dst)
        print(f"  {f} → words/{f}")

    # 清理源目录已删除或已被过滤的旧文件
    cleanup_orphaned_files(src_md_files)

    # 生成 manifest（含文件哈希用于变更检测）
    hashes = {}
    for f in src_md_files:
        dst = os.path.join(WORDS_DIR, f)
        sha = hashlib.sha256()
        with open(dst, "rb") as fh:
            for chunk in iter(lambda: fh.read(8192), b""):
                sha.update(chunk)
        hashes[f] = sha.hexdigest()[:12]

    manifest = {
        "version": datetime.now().isoformat(),
        "files": src_md_files,
        "hashes": hashes
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n已生成 manifest.json（{len(src_md_files)} 个文件）")
    return manifest


def git_commit_and_push():
    try:
        # 先拉取远程更新，避免 push 时冲突
        print("拉取远程更新...")
        subprocess.run(["git", "pull", "--rebase", "origin", "main"],
                       cwd=SCRIPT_DIR, check=True)
    except subprocess.CalledProcessError as e:
        print(f"警告: 拉取远程更新失败，继续尝试提交。错误: {e}")

    try:
        subprocess.run(["git", "add", "words/"], cwd=SCRIPT_DIR, check=True)
        subprocess.run(["git", "commit", "-m", f"sync: update words {datetime.now().strftime('%m-%d %H:%M')}"],
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
    manifest = sync_from_source()
    if manifest is None:
        input("\n按回车退出...")
        return

    print()
    git_commit_and_push()

    input("\n按回车退出...")


if __name__ == "__main__":
    main()
