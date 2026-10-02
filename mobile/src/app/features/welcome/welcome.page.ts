import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './welcome.page.html',
  styleUrls: ['./welcome.page.scss'],
})
export class WelcomePage implements OnInit, OnDestroy {
  activeDot = 0;
  private dotTimer: any;

  constructor(private router: Router) {}

  ngOnInit() {
    // sincroniza dots con el carrusel (ciclo de 15s / 4 slides ≈ 3.75s)
    this.dotTimer = setInterval(() => {
      this.activeDot = (this.activeDot + 1) % 3;
    }, 3750);
  }

  ngOnDestroy() {
    clearInterval(this.dotTimer);
  }

  startApp() {
    const page = document.querySelector('.welcome-page');
    if (page) page.classList.add('page-exit');
    setTimeout(() => this.router.navigate(['/channels']), 350);
  }
}

