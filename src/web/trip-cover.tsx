export function TripCover({ id, src }: { id: string; src: string }) {
  return src ? (
    <img className="trip-cover-image" data-trip-cover={id} src={src} alt="" />
  ) : null;
}
