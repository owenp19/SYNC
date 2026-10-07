import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, tap } from 'rxjs';
import { ServerConnectionService } from '@core/services/server-connection.service';
import { User } from '../models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private server = inject(ServerConnectionService);
  private http = inject(HttpClient);
  private router = inject(Router);

  private tokenKey = 'sync_token';
  private userKey = 'sync_user';
  currentUser$ = new BehaviorSubject<User | null>(this.loadUser());

  login(email: string, password: string) {
    return this.http.post<{ token: string; user: any }>(`${this.server.apiUrl}/auth/login`, { email, password }).pipe(
      tap(res => {
        localStorage.setItem(this.tokenKey, res.token);
        localStorage.setItem(this.userKey, JSON.stringify(res.user));
        this.currentUser$.next(res.user);
      })
    );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.currentUser$.next(null);
    this.router.navigateByUrl('/auth/login');
  }

  private loadUser(): User | null {
    const raw = localStorage.getItem(this.userKey);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  get token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  get isAuthenticated(): boolean {
    return !!this.token;
  }
}
