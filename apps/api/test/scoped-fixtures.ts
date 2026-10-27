import { PrismaClient } from '@prisma/client';

/** A foreign-facility fixture needs its own department, just like real records. */
export async function fixtureDepartment(prisma: PrismaClient, facilityId: string, templateId: string) {
  const template = await prisma.department.findUniqueOrThrow({ where: { id: templateId } });
  if (template.facilityId === facilityId) return template.id;
  const code = `${template.code}_scope_fixture`;
  return (await prisma.department.upsert({
    where: { facilityId_code: { facilityId, code } },
    create: { facilityId, code, name: template.name, type: template.type },
    update: {},
  })).id;
}
