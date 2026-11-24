/** Chaves no bucket: sempre pelo id (nunca pelo nome do arquivo), então nomes repetidos não se sobrescrevem. */
export const keys = {
  original: (eventId: string, mediaId: string, ext: string) => `events/${eventId}/originals/${mediaId}.${ext}`,
  derived: (eventId: string, mediaId: string, name: string) => `events/${eventId}/derived/${mediaId}/${name}`,
  cover: (eventId: string, id: string, ext: string) => `events/${eventId}/cover/${id}.${ext}`,
  eventPrefix: (eventId: string) => `events/${eventId}/`,
  logo: (id: string, ext: string) => `brand/logo-${id}.${ext}`,
};
