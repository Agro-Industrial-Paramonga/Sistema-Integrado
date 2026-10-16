// firebase-messaging-sw.js
// Service Worker de Firebase Cloud Messaging
// Maneja las notificaciones cuando la app está en segundo plano o cerrada

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyA7Qetf1kwg2orGCbEwsRqeh0a11gtcs4U",
  authDomain: "cotingencia-1eead.firebaseapp.com",
  projectId: "cotingencia-1eead",
  storageBucket: "cotingencia-1eead.firebasestorage.app",
  messagingSenderId: "557548438329",
  appId: "1:557548438329:web:6745fb497c2cc89117dee8"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Notificación en segundo plano:', payload);

  const notificationTitle = payload.notification?.title || '🚨 ALERTA DE HUAYCO';
  const notificationOptions = {
    body: payload.notification?.body || 'Revisa tu plan de contingencia.',
    icon: './assets/logo.png',
    badge: './assets/logo.png',
    vibrate: [300, 100, 300, 100, 300, 100, 300],
    requireInteraction: true,
    tag: 'alerta-huayco',
    renotify: true
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Cuando el usuario toca la notificación, abrir/enfocar la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
});
