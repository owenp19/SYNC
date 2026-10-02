import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'welcome', loadComponent: () => import('./features/welcome/welcome.page').then(m => m.WelcomePage) },
  { path: 'onboarding', loadComponent: () => import('./features/onboarding/onboarding.page').then(m => m.OnboardingPage) },
  { path: '', redirectTo: 'welcome', pathMatch: 'full' },
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'channels', loadComponent: () => import('./features/channels/channels.page').then(m => m.ChannelsPage) },
  { path: 'talk/:id', loadComponent: () => import('./features/push-to-talk/push-to-talk.page').then(m => m.PushToTalkPage) }
];



