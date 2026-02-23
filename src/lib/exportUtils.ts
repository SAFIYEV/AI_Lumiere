import html2canvas from 'html2canvas-pro'
import jsPDF from 'jspdf'
import PptxGenJS from 'pptxgenjs'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').trim())
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '• ')
    .replace(/^\d+\.\s+/gm, (m) => m)
    .replace(/^>\s+/gm, '')
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractSections(md: string): { title: string; body: string }[] {
  const lines = md.split('\n')
  const sections: { title: string; body: string }[] = []
  let currentTitle = ''
  let currentBody: string[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/)
    if (headingMatch) {
      if (currentTitle || currentBody.length) {
        sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
      }
      currentTitle = headingMatch[1].replace(/\*\*/g, '')
      currentBody = []
    } else {
      currentBody.push(line)
    }
  }
  if (currentTitle || currentBody.length) {
    sections.push({ title: currentTitle, body: currentBody.join('\n').trim() })
  }

  return sections
}

const PDF_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .pdf-root {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 14px;
    line-height: 1.75;
    color: #1a1a1a;
    background: #fff;
    width: 794px;
    padding: 48px 56px;
  }
  .pdf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: #999;
    padding-bottom: 12px;
    margin-bottom: 20px;
    border-bottom: 2px solid #d4a04a;
  }
  .pdf-title {
    font-size: 21px;
    font-weight: 700;
    color: #111;
    margin-bottom: 18px;
    line-height: 1.3;
  }
  .pdf-body h1 { font-size: 19px; font-weight: 700; margin: 22px 0 8px; color: #111; }
  .pdf-body h2 { font-size: 17px; font-weight: 600; margin: 18px 0 6px; color: #222; }
  .pdf-body h3 { font-size: 15px; font-weight: 600; margin: 14px 0 4px; color: #333; }
  .pdf-body h4 { font-size: 14px; font-weight: 600; margin: 12px 0 4px; color: #333; }
  .pdf-body p { margin: 8px 0; }
  .pdf-body strong { font-weight: 700; }
  .pdf-body em { font-style: italic; }
  .pdf-body ul, .pdf-body ol { margin: 8px 0; padding-left: 24px; }
  .pdf-body li { margin: 3px 0; }
  .pdf-body code {
    background: #f3f3f3;
    padding: 1px 5px;
    border-radius: 3px;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 12.5px;
  }
  .pdf-body pre {
    background: #f7f7f7;
    padding: 14px 16px;
    border-radius: 6px;
    margin: 12px 0;
    border: 1px solid #e5e5e5;
    overflow-x: hidden;
    word-break: break-word;
  }
  .pdf-body pre code {
    background: none;
    padding: 0;
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
  .pdf-body blockquote {
    border-left: 3px solid #d4a04a;
    padding: 8px 16px;
    margin: 10px 0;
    color: #555;
    background: #fdf8f0;
    border-radius: 0 4px 4px 0;
  }
  .pdf-body table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;
  }
  .pdf-body thead th {
    background: #f0f0f0;
    font-weight: 600;
    text-align: left;
    padding: 8px 10px;
    border: 1px solid #d0d0d0;
  }
  .pdf-body tbody td {
    padding: 7px 10px;
    border: 1px solid #d0d0d0;
    text-align: left;
  }
  .pdf-body tbody tr:nth-child(even) {
    background: #fafafa;
  }
  .pdf-body hr { border: none; height: 1px; background: #e0e0e0; margin: 18px 0; }
  .pdf-body a { color: #b38312; text-decoration: underline; }
`

export async function exportToPdf(content: string, title?: string) {
  const htmlBody = marked.parse(content) as string
  const date = new Date().toLocaleDateString('ru-RU')

  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;'
  container.innerHTML = `
    <div id="pdf-render" class="pdf-root">
      <style>${PDF_STYLES}</style>
      <div class="pdf-header">
        <span>AI Lumiere</span>
        <span>${date}</span>
      </div>
      ${title ? `<div class="pdf-title">${title}</div>` : ''}
      <div class="pdf-body">${htmlBody}</div>
    </div>
  `

  document.body.appendChild(container)

  try {
    const el = container.querySelector('#pdf-render') as HTMLElement
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: 794,
    })

    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfW = pdf.internal.pageSize.getWidth()
    const pdfH = pdf.internal.pageSize.getHeight()
    const imgW = pdfW
    const imgH = (canvas.height * imgW) / canvas.width

    let remaining = imgH
    let offset = 0

    pdf.addImage(imgData, 'JPEG', 0, offset, imgW, imgH)
    remaining -= pdfH

    while (remaining > 0) {
      offset -= pdfH
      pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, offset, imgW, imgH)
      remaining -= pdfH
    }

    const filename = (title || 'ai-lumiere-document')
      .replace(/[^\wА-Яа-яЁё\s-]/g, '')
      .replace(/\s+/g, '_')
      .slice(0, 50)
    pdf.save(`${filename}.pdf`)
  } finally {
    document.body.removeChild(container)
  }
}

export async function exportToPptx(content: string, title?: string) {
  const pptx = new PptxGenJS()
  pptx.author = 'AI Lumiere'
  pptx.title = title || 'Презентация'

  const sections = extractSections(content)

  const titleSlide = pptx.addSlide()
  titleSlide.background = { color: '0a0a0a' }
  titleSlide.addText(title || 'Презентация', {
    x: 0.5, y: 1.5, w: 9, h: 1.5,
    fontSize: 36, bold: true, color: 'D4A04A', align: 'center', fontFace: 'Arial',
  })
  titleSlide.addText('AI Lumiere', {
    x: 0.5, y: 3.2, w: 9, h: 0.6,
    fontSize: 16, color: '888888', align: 'center', fontFace: 'Arial',
  })
  titleSlide.addText(new Date().toLocaleDateString('ru-RU'), {
    x: 0.5, y: 3.8, w: 9, h: 0.5,
    fontSize: 12, color: '666666', align: 'center', fontFace: 'Arial',
  })

  const MAX_BODY_LEN = 800

  for (const section of sections) {
    if (!section.title && !section.body.trim()) continue

    const slide = pptx.addSlide()
    slide.background = { color: '0a0a0a' }
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: 'D4A04A' } })

    if (section.title) {
      slide.addText(section.title, {
        x: 0.6, y: 0.35, w: 8.8, h: 0.9,
        fontSize: 24, bold: true, color: 'ECECEC', fontFace: 'Arial',
      })
    }

    const bodyClean = stripMarkdown(section.body)
    if (bodyClean) {
      const truncated = bodyClean.length > MAX_BODY_LEN
        ? bodyClean.slice(0, MAX_BODY_LEN) + '...'
        : bodyClean

      const bullets = truncated
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => ({
          text: l.replace(/^•\s*/, ''),
          options: {
            fontSize: 14,
            color: 'C0C0C0' as const,
            bullet: l.startsWith('•'),
            breakLine: true as const,
          },
        }))

      slide.addText(bullets, {
        x: 0.6, y: section.title ? 1.4 : 0.5, w: 8.8, h: 3.8,
        fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.3,
      })
    }
  }

  if (sections.length === 0) {
    const plain = stripMarkdown(content)
    const chunks = splitTextIntoChunks(plain, 600)

    for (const chunk of chunks) {
      const slide = pptx.addSlide()
      slide.background = { color: '0a0a0a' }
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.08, fill: { color: 'D4A04A' } })
      slide.addText(chunk, {
        x: 0.6, y: 0.5, w: 8.8, h: 4.5,
        fontSize: 14, color: 'C0C0C0', fontFace: 'Arial', valign: 'top', lineSpacingMultiple: 1.3,
      })
    }
  }

  const filename = (title || 'ai-lumiere-presentation')
    .replace(/[^\wА-Яа-яЁё\s-]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 50)
  await pptx.writeFile({ fileName: `${filename}.pptx` })
}

function splitTextIntoChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    let cut = remaining.lastIndexOf('\n', maxLen)
    if (cut < maxLen * 0.3) cut = remaining.lastIndexOf(' ', maxLen)
    if (cut < maxLen * 0.3) cut = maxLen
    chunks.push(remaining.slice(0, cut).trim())
    remaining = remaining.slice(cut).trim()
  }
  return chunks
}
