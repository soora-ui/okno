import { randomUUID } from "node:crypto";

type MockBookingConfirmation = {
  id: string;
  username: string;
  clientName: string;
  serviceTitle: string;
  startsAtIso: string;
  endsAtIso: string;
  masterName: string;
  cancellationToken: string;
};

type GlobalWithMockBookingStore = typeof globalThis & {
  __oknoMockBookingConfirmations?: Map<string, MockBookingConfirmation>;
};

const globalStore = globalThis as GlobalWithMockBookingStore;

const confirmationStore =
  globalStore.__oknoMockBookingConfirmations ??
  new Map<string, MockBookingConfirmation>();

if (!globalStore.__oknoMockBookingConfirmations) {
  globalStore.__oknoMockBookingConfirmations = confirmationStore;
}

export function saveMockBookingConfirmation(
  input: Omit<MockBookingConfirmation, "id">,
) {
  const id = randomUUID();
  const confirmation = { id, ...input };

  confirmationStore.set(id, confirmation);

  return confirmation;
}

export function getMockBookingConfirmation(bookingId: string) {
  return confirmationStore.get(bookingId) ?? null;
}
