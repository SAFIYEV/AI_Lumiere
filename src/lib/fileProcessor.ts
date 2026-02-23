import * as pdfjsLib from 'pdfjs-dist'
import { createWorker, type Worker } from 'tesseract.js'
import type { FileAttachment } from '../types'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

const MAX_FILE_SIZE = 20 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_PDF_TYPES = ['application/pdf']
const MAX_OCR_PAGES = 10

let ocrWorker: Worker | null = null
let ocrInitPromise: Promise<Worker> | null = null

async function getOcrWorker(): Promise<Worker> {
  if (ocrWorker) return ocrWorker
  if (ocrInitPromise) return ocrInitPromise

  ocrInitPromise = (async () => {
    const worker = await createWorker('rus+eng')
    ocrWorker = worker
    return worker
  })()

  return ocrInitPromise
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function extractPdfText(file: File): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file)
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((item: any) => item.str)
      .join(' ')
    if (text.trim()) {
      pages.push(`[Страница ${i}]\n${text.trim()}`)
    }
  }

  return pages.join('\n\n')
}

async function ocrPdfPages(file: File, onProgress?: (msg: string) => void): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file)
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
  const totalPages = Math.min(pdf.numPages, MAX_OCR_PAGES)

  onProgress?.(`OCR: загрузка модели...`)
  const worker = await getOcrWorker()

  const pages: string[] = []
  for (let i = 1; i <= totalPages; i++) {
    onProgress?.(`OCR: страница ${i}/${totalPages}...`)
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')!
    await (page.render({ canvasContext: ctx, viewport } as any)).promise

    const { data } = await worker.recognize(canvas)
    if (data.text.trim()) {
      pages.push(`[Страница ${i}]\n${data.text.trim()}`)
    }
  }

  if (pdf.numPages > MAX_OCR_PAGES) {
    pages.push(`\n[... ещё ${pdf.numPages - MAX_OCR_PAGES} страниц не обработано (лимит OCR: ${MAX_OCR_PAGES})]`)
  }

  return pages.join('\n\n')
}

async function ocrImage(dataUrl: string, onProgress?: (msg: string) => void): Promise<string> {
  onProgress?.('OCR: распознавание текста...')
  const worker = await getOcrWorker()
  const { data } = await worker.recognize(dataUrl)
  return data.text.trim()
}

function createImagePreview(dataUrl: string, maxSize = 80): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export async function processFile(
  file: File,
  onProgress?: (msg: string) => void
): Promise<FileAttachment> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`Файл слишком большой (макс. ${MAX_FILE_SIZE / 1024 / 1024}МБ)`)
  }

  if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
    const dataUrl = await readFileAsDataURL(file)
    const preview = await createImagePreview(dataUrl)

    let ocrText: string | undefined
    try {
      ocrText = await ocrImage(dataUrl, onProgress) || undefined
    } catch {
      // OCR failed silently — image still usable via vision
    }

    return {
      id: crypto.randomUUID(),
      name: file.name,
      type: 'image',
      mimeType: file.type,
      data: dataUrl,
      preview,
      ocrText,
      size: file.size,
    }
  }

  if (ALLOWED_PDF_TYPES.includes(file.type)) {
    onProgress?.('Извлечение текста из PDF...')
    let text = await extractPdfText(file)

    if (!text.trim()) {
      onProgress?.('Скан-копия. Запуск OCR...')
      try {
        text = await ocrPdfPages(file, onProgress)
      } catch (err) {
        console.error('[AI Lumiere] OCR failed:', err)
      }
    }

    if (!text.trim()) {
      throw new Error('Не удалось извлечь текст из PDF (ни текстовый слой, ни OCR)')
    }

    return {
      id: crypto.randomUUID(),
      name: file.name,
      type: 'pdf',
      mimeType: file.type,
      data: text,
      size: file.size,
    }
  }

  throw new Error('Неподдерживаемый формат. Используйте PDF, JPG, PNG, GIF или WebP')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' Б'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ'
  return (bytes / (1024 * 1024)).toFixed(1) + ' МБ'
}
