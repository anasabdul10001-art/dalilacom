import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma";

/**
 * Deletes a person's data while keeping what the books need. Everything personal goes (profile, photo, contact details,
 * saved addresses, location, devices, notifications, sign-in links, the responder's rules, connections and conversations);
 * the account itself stays only as an anonymous, disabled row so orders, invoices, memberships and wallet records that other
 * people's accounts depend on keep making sense. A shop is taken off the map.
 */
export async function anonymizeAccount(userId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return;

    await tx.cartItem.deleteMany({ where: { cart: { userId } } });
    await tx.responderInteraction.deleteMany({ where: { userId } });
    await tx.responderRule.deleteMany({ where: { userId } });
    await tx.channelConnection.deleteMany({ where: { userId } });
    await tx.responderSubscription.deleteMany({ where: { userId } });
    await tx.address.deleteMany({ where: { userId } });
    await Promise.all([
      tx.userAvatar.deleteMany({ where: { userId } }),
      tx.deviceToken.deleteMany({ where: { userId } }),
      tx.socialIdentity.deleteMany({ where: { userId } }),
      tx.loginTicket.deleteMany({ where: { userId } }),
      tx.notification.deleteMany({ where: { userId } }),
      tx.notificationPreference.deleteMany({ where: { userId } }),
      tx.favoriteMerchant.deleteMany({ where: { userId } }),
      tx.metaOAuthSession.deleteMany({ where: { userId } }),
      tx.emailVerificationToken.deleteMany({ where: { userId } }),
      tx.passwordResetToken.deleteMany({ where: { userId } }),
    ]);
    await tx.merchantProfile.updateMany({
      where: { userId },
      data: { approvalStatus: "REJECTED", rejectionReason: "account deleted", address: null, phone: null, whatsapp: null, latitude: null, longitude: null },
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        email: `deleted-${userId}@deleted.invalid`,
        fullName: "حساب محذوف",
        phone: null,
        bio: null,
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10),
        isDisabled: true,
        isEmailVerified: false,
        tokenVersion: { increment: 1 },
        countryCode: null,
        cityId: null,
        vatNumber: null,
        lastLatitude: null,
        lastLongitude: null,
        locationUpdatedAt: null,
        avatarUpdatedAt: null,
      },
    });
  });
}

/** Removes only the link between a Facebook account and a Dalilacom account (what Facebook's "remove app" asks for). */
export async function unlinkFacebook(providerUserId: string): Promise<number> {
  const removed = await prisma.socialIdentity.deleteMany({ where: { provider: "FACEBOOK", providerUserId } });
  return removed.count;
}
