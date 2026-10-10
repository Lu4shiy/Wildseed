// js/main.js
// Главное меню Wildseed.
// Кнопки: PLAY / SELECT SERVER / PROFILE / ADD FRIENDS / SIGN IN / SETTINGS / EXIT.
// Реальная логика серверов, профиля, друзей и авторизации — в следующих этапах.
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const goto = url => { window.location.href = url; };

  // PLAY → выбор мира (старый лаунчер переехал в worlds.html).
  $('btnPlay').addEventListener('click', () => goto('worlds.html'));

  // SELECT SERVER → браузер серверов (появится вместе с мультиплеером).
  $('btnServers').addEventListener('click', () => {
    alert('Server browser — coming with multiplayer.');
  });

  // PROFILE → профиль игрока (аватар, статистика, скины — позже).
  $('btnProfile').addEventListener('click', () => {
    alert('Profile — coming soon.');
  });

  // ADD FRIENDS → список друзей (позже).
  $('btnFriends').addEventListener('click', () => {
    alert('Friends — coming soon.');
  });

  // SIGN IN → OAuth (Яндекс / GitHub / VK — позже).
  $('btnSignIn').addEventListener('click', () => {
    alert('Sign in — Yandex / GitHub / VK (coming soon).');
  });

  // SETTINGS → локальные настройки (позже).
  $('btnSettings').addEventListener('click', () => {
    alert('Settings — coming soon.');
  });

  // EXIT → закрыть вкладку. Если браузер блокирует — показать заглушку.
  $('btnExit').addEventListener('click', () => {
    window.close();
    setTimeout(() => {
      document.body.innerHTML =
        '<div style="color:#f9d54f;font-family:monospace;font-size:14px;' +
        'display:flex;align-items:center;justify-content:center;' +
        'height:100vh;background:#0d0b08;letter-spacing:0.1em;">' +
        'YOU MAY CLOSE THIS TAB NOW</div>';
    }, 80);
  });
})();