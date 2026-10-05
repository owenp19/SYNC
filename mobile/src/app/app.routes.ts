import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/auth.guard';
import { deviceGuard } from './core/guards/device.guard';

export const routes: Routes = [
  { path: 'activate', loadComponent: () => import('./features/activate/activate.page').then(m => m.ActivatePage) },
  { path: 'operator', canActivate: [deviceGuard], loadComponent: () => import('./features/operator/operator.page').then(m => m.OperatorPage) },
  { path: 'welcome', loadComponent: () => import('./features/welcome/welcome.page').then(m => m.WelcomePage) },
  { path: 'choose', loadComponent: () => import('./features/choose/choose.page').then(m => m.ChoosePage) },
  { path: '', redirectTo: 'welcome', pathMatch: 'full' },
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'channels', canActivate: [deviceGuard], loadComponent: () => import('./features/channels/channels.page').then(m => m.ChannelsPage) },
  { path: 'settings', canActivate: [adminGuard], loadComponent: () => import('./features/settings/settings.page').then(m => m.SettingsPage) },
  { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./features/admin/admin-dashboard.page').then(m => m.AdminDashboardPage) },
  { path: 'admin/assignments', canActivate: [adminGuard], loadComponent: () => import('./features/admin/assignments.page').then(m => m.AssignmentsPage) },
  { path: 'admin/manage', canActivate: [adminGuard], loadComponent: () => import('./features/admin/manage.page').then(m => m.ManagePage) },
  { path: 'admin/devices', canActivate: [adminGuard], loadComponent: () => import('./features/admin/devices.page').then(m => m.DevicesPage) },
  { path: 'talk/:id', canActivate: [deviceGuard], loadComponent: () => import('./features/push-to-talk/push-to-talk.page').then(m => m.PushToTalkPage) },
  { path: '**', redirectTo: 'welcome' }
];
