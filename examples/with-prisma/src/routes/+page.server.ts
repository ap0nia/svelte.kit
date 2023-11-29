import type { PageServerLoad, Actions } from './$types'

import { prisma } from '$lib/server/db'

export const load: PageServerLoad = async () => {
  const users = await prisma.user.findMany()
  return { users }
}

export const actions: Actions = {
  counter: async (event) => {
    const formData = await event.request.formData()

    const formUser = formData.get('user')
    const formCount = formData.get('count')

    if (formUser == null || formCount == null) {
      return
    }

    const id = `${formUser}`
    const count = +formCount

    const user = await prisma.user.upsert({
      where: {
        id,
      },
      create: {
        id,
        count,
      },
      update: {
        id,
        count,
      },
    })

    return { user }
  },
}
