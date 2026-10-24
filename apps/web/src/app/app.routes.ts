import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home').then((m) => m.Home),
  },
  {
    path: 'login',
    loadComponent: () => import('./login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./register').then((m) => m.Register),
  },
  { path: '**', redirectTo: '' },
];
