import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';


@Component({
  selector: 'app-choose',
  standalone: true,
  imports: [IonContent, IonIcon],
  templateUrl: './choose.page.html',
  styleUrls: ['./choose.page.scss'],
})
export class ChoosePage {
  private router = inject(Router);


  goChannels() { (document.activeElement as HTMLElement | null)?.blur(); this.router.navigate(['/channels']); }
  goAdmin() { (document.activeElement as HTMLElement | null)?.blur(); this.router.navigate(['/auth/login']); }
}
