import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, IonItem, IonInput, IonButton, IonIcon, ToastController } from '@ionic/angular';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonItem, IonInput, IonButton, IonIcon],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage {
  email = '';
  password = '';
  constructor(private auth: AuthService, private router: Router, private toast: ToastController) {}
  onLogin() {
    this.auth.login(this.email.trim(), this.password).subscribe({
      next: () => {
        const role = this.auth.currentUser$.value?.role;
        this.router.navigateByUrl(role === 'admin' ? '/admin' : '/channels');
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'No se pudo iniciar sesión. Revisa tu conexión.';
        this.toast.create({ message: msg, duration: 3000, color: 'danger', position: 'bottom' }).then(t => t.present());
      }
    });
  }
}
