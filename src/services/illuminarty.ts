import { UA_HEADER } from '@lib/const.ts'

export async function illuminartyImageAnalysis(url: string) {
  const file = await fetch(url).then(r => r.blob())
  const form = new FormData()
  form.append('file', file)

  const response = await fetch('https://app.illuminarty.ai/api/analysis/image', {
    method: 'POST',
    body: form,
    headers: {
      Origin: 'https://app.illuminarty.ai',
      Referer: 'https://app.illuminarty.ai/',
      ...UA_HEADER,
    },
  })

  return response
}
