import re
import os
import time
import requests
from urllib.parse import urlparse
from pathlib import Path


def find_urls(text, prefix):
    """
    Find all URLs using regex and filter by a given prefix.
    """
    # Regex for URLs starting with http(s)://
    # Allows capturing URLs inside parentheses, brackets, etc.
    url_pattern = re.compile(r'https?://[^\s<>"\')}\]]+', re.IGNORECASE)
    
    found = set()
    for url in url_pattern.findall(text):
        # Clean trailing punctuation that might have been captured
        url = url.rstrip('.,;:!?')
        if url.lower().startswith(prefix.lower()):
            found.add(url)
    return sorted(found)


def append_md(url):
    """
    Append .md to the URL. Avoid double .md.
    """
    if url.endswith('.md'):
        return url
    return url + '.md'


def extract_title(markdown_text):
    """
    Extract the first markdown H1 title (# Title).
    Falls back to first non-empty line if no H1 found.
    """
    # Try to find first level 1 heading
    match = re.search(r'^\s*#\s+(.+)$', markdown_text, re.MULTILINE)
    if match:
        return match.group(1).strip()
    
    # Fallback: first non-empty line
    for line in markdown_text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped.lstrip('#').strip()
    
    return None


def sanitize_filename(name, max_length=100):
    """
    Make a safe filename from a title.
    """
    if not name:
        return "untitled"
    
    # Remove/replace unsafe characters
    name = re.sub(r'[\\/*?:"<>|]', '-', name)
    name = re.sub(r'\s+', '-', name.strip())
    name = name.strip('.-')
    
    if not name:
        return "untitled"
    
    if len(name) > max_length:
        name = name[:max_length]
    
    return name + '.md'


def safe_url_to_filename(url):
    """
    Backup filename from URL path if title extraction fails.
    """
    path = urlparse(url).path.strip('/')
    if path:
        base = os.path.basename(path) or "page"
    else:
        base = "page"
    return sanitize_filename(base.replace('.md', ''))


def download_markdown(url, output_dir, headers, delay=1):
    """
    Download the .md URL and save it with a title-based filename.
    """
    print(f"Downloading: {url}")
    try:
        response = requests.get(url, headers=headers, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        print(f"  ERROR downloading {url}: {e}")
        return

    content = response.text

    # Try to use the title for filename
    title = extract_title(content)
    if title:
        filename = sanitize_filename(title)
    else:
        filename = safe_url_to_filename(url)

    output_path = Path(output_dir) / filename

    # Handle duplicate filenames by appending a counter
    counter = 1
    stem = output_path.stem
    while output_path.exists():
        # filename = f"{stem}_{counter}.md"
        filename = f"{str(url).split("/")[-1]}"
        output_path = Path(output_dir) / filename
        counter += 1

    output_path.write_text(content, encoding='utf-8')
    print(f"  Saved: {output_path}")
    
    time.sleep(delay)


def main(input_md_file, url_prefix, output_dir='downloaded_md', delay=1):
    os.makedirs(output_dir, exist_ok=True)
    
    text = Path(input_md_file).read_text(encoding='utf-8')
    
    urls = find_urls(text, url_prefix)
    print(f"Found {len(urls)} URL(s) matching prefix: {url_prefix}")
    
    headers = {
        'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                       'AppleWebKit/537.36 (KHTML, like Gecko) '
                       'Chrome/115.0.0.0 Safari/537.36')
    }
    
    for url in urls:
        md_url = append_md(url)
        download_markdown(md_url, output_dir, headers, delay)


if __name__ == '__main__':
    # Customize these values
    INPUT_FILE = 'shadcn/Components.md'          # The markdown file to read
    URL_PREFIX = 'https://ui.shadcn.com/docs/components/'  # Domain/prefix to filter URLs
    OUTPUT_DIR = 'shadcn'     # Where to save downloaded files
    DELAY = 1                        # Seconds between requests (be polite)

    main(INPUT_FILE, URL_PREFIX, OUTPUT_DIR, DELAY)
