// proper initialization
if( 'function' === typeof importScripts) {
  /* eslint-disable no-undef */
  importScripts("https://js.pusher.com/beams/service-worker.js");
}

// La nouvelle version du worker remplace immédiatement l'ancienne, sans attendre la fermeture des onglets
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function windowClients() {
  // includeUncontrolled : sous Chrome, la page qui a enregistré le worker n'est pas "contrôlée" avant un rechargement
  return self.clients.matchAll({type: "window", includeUncontrolled: true});
}

PusherPushNotifications.onNotificationReceived = ({
  pushEvent,
  payload,
}) => {
  console.log("worker got : " + JSON.stringify(payload));

  const notification = payload.notification || {};
  const url = notification.deep_link || "/messages";

  pushEvent.waitUntil(windowClients().then((clients) => {
    // Prévient les onglets ouverts : ils mettent à jour la conversation et les non-lus
    clients.forEach(client => client.postMessage({...payload.data, kind: "push"}));

    // Inutile d'afficher la notification si la conversation est déjà affichée au premier plan
    const path = new URL(url, self.location.origin).pathname;
    if (clients.some(client => client.focused && new URL(client.url).pathname === path)) {
      return;
    }
    // Le tag (identifiant du message) évite un doublon avec la notification affichée par l'onglet ouvert
    return self.registration.showNotification(notification.title || "", {
      body: notification.body || "",
      icon: notification.icon,
      tag: payload.data?.messageId,
      data: {url},
    });
  }));
};

// Clic sur une notification (push ou affichée par l'onglet) : réutilise un onglet ouvert si possible
self.addEventListener("notificationclick", (event) => {
  const url = event.notification.data?.url;
  if (!url || event.notification.data.pusher) {
    return; // notification gérée par le worker Pusher
  }
  event.notification.close();
  const target = new URL(url, self.location.origin);
  event.waitUntil(windowClients().then((clients) => {
    const client = clients.find(c => new URL(c.url).origin === target.origin);
    if (client) {
      client.postMessage({kind: "navigate", path: target.pathname});
      return client.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
