import os

filepath = r"b:\artth\Projects\Apps\Youtube-downloader\frontend\script.ts"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add global declare for window.electronAPI
if "declare global" not in content:
    content = """declare global {
    interface Window { electronAPI: any; }
}

""" + content

# Fix .checked for HTMLInputElement
content = content.replace("document.getElementById('checkAutoStart').checked", "(document.getElementById('checkAutoStart') as HTMLInputElement).checked")
content = content.replace("document.getElementById('checkStartHidden').checked", "(document.getElementById('checkStartHidden') as HTMLInputElement).checked")
content = content.replace("document.getElementById('checkMinimizeTray').checked", "(document.getElementById('checkMinimizeTray') as HTMLInputElement).checked")
content = content.replace("document.getElementById('checkStartHidden').disabled", "(document.getElementById('checkStartHidden') as HTMLInputElement).disabled")

# Fix .value
content = content.replace("document.getElementById('urlInput').value", "(document.getElementById('urlInput') as HTMLInputElement).value")
content = content.replace("document.getElementById('plMode').value", "(document.getElementById('plMode') as HTMLSelectElement).value")
content = content.replace("document.getElementById('plQuality').value", "(document.getElementById('plQuality') as HTMLSelectElement).value")

# Fix modeSelect
content = content.replace("const modeSelect = document.getElementById('plMode');", "const modeSelect = document.getElementById('plMode') as HTMLSelectElement;")

# Fix .src
content = content.replace("document.getElementById('vidThumbnail').src", "(document.getElementById('vidThumbnail') as HTMLImageElement).src")

# Fix event.target / currentTarget
content = content.replace("event.currentTarget.classList", "(event.currentTarget as HTMLElement).classList")
content = content.replace("event.target.classList", "(event.target as HTMLElement).classList")
content = content.replace("const btn = event.target;", "const btn = event.target as HTMLElement;")

# Fix Promise
content = content.replace("new Promise((resolve) => {", "new Promise<void>((resolve) => {")

# Fix innerText/style assignment on item progress (lines 293/294 from old JS)
content = content.replace("btn.innerText =", "btn.innerText =") # not strictly needed if cast to HTMLElement

# Fix .checked on EventTarget
content = content.replace("e.target.checked", "(e.target as HTMLInputElement).checked")

# specific fix for 'queueCount' assignment to string/number
content = content.replace("document.getElementById('queueCount').innerText = c;", "document.getElementById('queueCount')!.innerText = c.toString();")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Patched!")
