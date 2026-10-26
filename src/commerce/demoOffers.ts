import type { Deal } from '../types';

export const formatBRL = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export const hasDemoPrice = (offer: Deal) => Number.isFinite(offer.priceBRL) && offer.priceBRL >= 0;

// Presentation grouping keeps the title identity used by the existing demo wishlist.
export function groupDemoOffers(offers: readonly Deal[]) {
  const groups = new Map<string, Deal[]>();
  for (const offer of offers) {
    const group = groups.get(offer.title) ?? [];
    group.push(offer);
    groups.set(offer.title, group);
  }
  return [...groups].map(([title, items]) => ({ title, offers: items }));
}

export function lowestDemoOffer(offers: readonly Deal[]): Deal | undefined {
  return offers.filter(hasDemoPrice).reduce<Deal | undefined>((lowest, offer) =>
    !lowest || offer.priceBRL < lowest.priceBRL ? offer : lowest, undefined);
}
