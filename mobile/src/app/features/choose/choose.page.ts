import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-choose',
  standalone: true,
  imports: [CommonModule, IonContent, IonIcon],
  templateUrl: './choose.page.html',
  styleUrls: ['./choose.page.scss'],
})
export class ChoosePage {
  constructor(private router: Router) {}

  goChannels() { (document.activeElement as HTMLElement | null)?.blur(); this.router.navigate(['/channels']); }
  goAdmin() { (document.activeElement as HTMLElement | null)?.blur(); this.router.navigate(['/admin']); }
}
