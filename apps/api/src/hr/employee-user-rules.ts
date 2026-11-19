import type { PrismaService } from '../prisma/prisma.service';
import { userEmailTaken, usernameTaken } from './hr-errors';

/**
 * The linked user's username is the Employee Code and its email the official email (OQ-135,
 * OQ-149). Both must be free among the other users, ignoring case (same rule as Users).
 */
export async function assertUserFieldsFree(
  prisma: PrismaService,
  username: string,
  email: string | null,
  ownUserId: string | null,
): Promise<void> {
  const exclude = ownUserId === null ? {} : { id: { not: ownUserId } };
  const sameUsername = await prisma.user.findFirst({
    where: { ...exclude, username: { equals: username, mode: 'insensitive' } },
    select: { id: true },
  });

  if (sameUsername !== null) {
    throw usernameTaken();
  }

  if (email === null) {
    return;
  }

  const sameEmail = await prisma.user.findFirst({
    where: { ...exclude, email: { equals: email, mode: 'insensitive' } },
    select: { id: true },
  });

  if (sameEmail !== null) {
    throw userEmailTaken();
  }
}
