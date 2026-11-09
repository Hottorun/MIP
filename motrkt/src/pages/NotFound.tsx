import { Link } from "react-router-dom";
import { t } from "../i18n";

export default function NotFound() {
  return (
    <div className="panel mx-auto mt-16 max-w-md p-8 text-center">
      <div className="font-serif text-5xl text-gold">404</div>
      <p className="mt-3 text-muted">
        {t("Diese Seite gibt es nicht – vielleicht wurde das Fahrzeug aus dem Katalog entfernt.", "This page doesn’t exist – perhaps the car was removed from the catalogue.")}
      </p>
      <Link to="/" className="btn btn-gold mt-5">
        {t("Zum Marktüberblick", "Go to the market overview")}
      </Link>
    </div>
  );
}
