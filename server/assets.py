"""Small, bounded downloads of public font/model assets; never document content."""
from pathlib import Path
import os
import urllib.error
import urllib.request


def cache_root() -> Path:
    configured = os.environ.get("REAGE_CACHE_DIR")
    if configured:
        root = Path(configured)
    elif os.name == "nt":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home())) / "Reage" / "cache"
    else:
        root = Path(os.environ.get("XDG_CACHE_HOME", Path.home() / ".cache")) / "reage"
    root.mkdir(parents=True, exist_ok=True)
    return root


def download(url: str, maximum: int = 30 * 1024 * 1024) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Reage-PDF-Editor/0.2", "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            data = response.read(maximum + 1)
    except urllib.error.HTTPError:
        raise
    except (OSError, TimeoutError) as exc:
        raise ValueError("The asset could not be downloaded. Check your internet connection, then retry. Your PDF was not uploaded.") from exc
    if len(data) > maximum:
        raise ValueError("This asset exceeds the 30 MB download limit.")
    return data


OCR_LANGUAGES = {
    "eng": "English", "ara": "Arabic", "ben": "Bengali", "chi_sim": "Chinese (simplified)",
    "chi_tra": "Chinese (traditional)", "deu": "German", "fra": "French", "hin": "Hindi",
    "ita": "Italian", "jpn": "Japanese", "kor": "Korean", "por": "Portuguese",
    "rus": "Russian", "spa": "Spanish", "tam": "Tamil", "tel": "Telugu", "tha": "Thai",
    "tur": "Turkish", "urd": "Urdu", "vie": "Vietnamese", "heb": "Hebrew",
}


def language_model(language: str) -> Path:
    if language not in OCR_LANGUAGES:
        raise ValueError("Choose a supported OCR language.")
    directory = cache_root() / "tessdata"
    directory.mkdir(exist_ok=True)
    path = directory / f"{language}.traineddata"
    if not path.is_file():
        data = download(f"https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/{language}.traineddata")
        temporary = path.with_suffix(".download")
        temporary.write_bytes(data)
        temporary.replace(path)
    return path
