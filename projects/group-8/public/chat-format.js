// Render a small Markdown subset using text nodes only. Model text never becomes HTML.
function inline(parent, source) {
  const pattern = /\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*/g;
  let previous = 0;
  for (const match of source.matchAll(pattern)) {
    parent.append(document.createTextNode(source.slice(previous, match.index)));
    const element = document.createElement(match[1] !== undefined ? 'strong' : match[2] !== undefined ? 'code' : 'em');
    element.textContent = match[1] ?? match[2] ?? match[3];
    parent.append(element);
    previous = match.index + match[0].length;
  }
  parent.append(document.createTextNode(source.slice(previous)));
}

export function renderAssistantContent(container, source) {
  container.replaceChildren();
  let paragraph;
  let list;
  for (const raw of String(source).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { paragraph = null; list = null; continue; }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    const ordered = /^(\d+)[.)]\s+(.+)$/.exec(line);
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (bullet || ordered) {
      const tag = ordered ? 'ol' : 'ul';
      if (!list || list.localName !== tag) {
        list = document.createElement(tag);
        if (ordered) list.start = Number(ordered[1]);
        container.append(list);
      }
      const item = document.createElement('li');
      inline(item, ordered ? ordered[2] : bullet[1]);
      list.append(item);
      paragraph = null;
    } else if (heading) {
      const title = document.createElement('h3');
      inline(title, heading[1]);
      container.append(title);
      paragraph = null; list = null;
    } else {
      list = null;
      if (!paragraph) { paragraph = document.createElement('p'); container.append(paragraph); }
      else paragraph.append(document.createElement('br'));
      inline(paragraph, line);
    }
  }
}
