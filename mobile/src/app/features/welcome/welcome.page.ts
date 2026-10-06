import { Component, OnDestroy, OnInit, signal, inject } from '@angular/core';

import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [IonContent, IonIcon],
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss'],
})
export class WelcomePage implements OnInit, OnDestroy {
  private router = inject(Router);

  activeDot = signal(0);
  private dotTimer: any;

  ngOnInit() {
    this.dotTimer = setInterval(() => {
      this.activeDot.update(d => (d + 1) % 3);
    }, 4000);
  }

  ngOnDestroy() {
    clearInterval(this.dotTimer);
  }

  startApp() {
    // Evita el aviso de aria-hidden: quitar el foco del botón antes de navegar
    (document.activeElement as HTMLElement | null)?.blur();
    const page = document.querySelector('.welcome-page');
    if (page) page.classList.add('page-exit');
    setTimeout(() => this.router.navigate(['/choose']), 350);
  }
}

