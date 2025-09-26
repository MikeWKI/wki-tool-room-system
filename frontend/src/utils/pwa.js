// PWA Utilities for installation and offline support

class PWAManager {
  constructor() {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.isOnline = navigator.onLine;
    this.installButton = null;
    
    this.init();
  }

  init() {
    // Check if already installed
    this.checkInstallation();
    
    // Register service worker
    this.registerServiceWorker();
    
    // Setup installation prompt
    this.setupInstallPrompt();
    
    // Setup online/offline detection
    this.setupOnlineDetection();
    
    // Hide loading screen
    this.hideLoadingScreen();
  }

  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[PWA] Service Worker registered successfully:', registration);
        
        // Handle service worker updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              this.showUpdateAvailable();
            }
          });
        });
        
        return registration;
      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    }
  }

  setupInstallPrompt() {
    // Listen for the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA] Install prompt available');
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later
      this.deferredPrompt = e;
      // Show custom install button
      this.showInstallButton();
    });

    // Handle app installation
    window.addEventListener('appinstalled', (e) => {
      console.log('[PWA] App was installed successfully');
      this.isInstalled = true;
      this.hideInstallButton();
      this.deferredPrompt = null;
      
      // Track installation
      this.trackInstallation();
    });
  }

  setupOnlineDetection() {
    window.addEventListener('online', () => {
      console.log('[PWA] App is back online');
      this.isOnline = true;
      this.showOnlineStatus();
      this.syncWhenOnline();
    });

    window.addEventListener('offline', () => {
      console.log('[PWA] App went offline');
      this.isOnline = false;
      this.showOfflineStatus();
    });
  }

  checkInstallation() {
    // Check if running in standalone mode (installed)
    this.isInstalled = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;
    
    if (this.isInstalled) {
      console.log('[PWA] App is running in installed mode');
    }
  }

  async showInstallPrompt() {
    if (!this.deferredPrompt) {
      console.log('[PWA] Install prompt not available');
      return false;
    }

    // Show the install prompt
    this.deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const result = await this.deferredPrompt.userChoice;
    console.log('[PWA] User response to install prompt:', result);
    
    if (result.outcome === 'accepted') {
      console.log('[PWA] User accepted the install prompt');
      return true;
    } else {
      console.log('[PWA] User dismissed the install prompt');
      return false;
    }
  }

  showInstallButton() {
    // Create install button if it doesn't exist
    if (!this.installButton) {
      this.installButton = this.createInstallButton();
    }
    
    if (this.installButton) {
      this.installButton.style.display = 'block';
    }
  }

  hideInstallButton() {
    if (this.installButton) {
      this.installButton.style.display = 'none';
    }
  }

  createInstallButton() {
    // This will be integrated with the React component
    // For now, return null and handle in React
    return null;
  }

  showUpdateAvailable() {
    // Show update notification
    const event = new CustomEvent('pwa-update-available', {
      detail: { message: 'A new version of the app is available!' }
    });
    window.dispatchEvent(event);
  }

  showOnlineStatus() {
    const event = new CustomEvent('pwa-online-status', {
      detail: { online: true }
    });
    window.dispatchEvent(event);
  }

  showOfflineStatus() {
    const event = new CustomEvent('pwa-online-status', {
      detail: { online: false }
    });
    window.dispatchEvent(event);
  }

  async syncWhenOnline() {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('background-sync');
        console.log('[PWA] Background sync registered');
      } catch (error) {
        console.error('[PWA] Background sync registration failed:', error);
      }
    }
  }

  hideLoadingScreen() {
    setTimeout(() => {
      const loader = document.getElementById('pwa-loader');
      if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
          loader.remove();
        }, 300);
      }
    }, 1000);
  }

  trackInstallation() {
    // Analytics tracking for app installation
    if (typeof gtag !== 'undefined') {
      gtag('event', 'pwa_install', {
        event_category: 'PWA',
        event_label: 'App Installation'
      });
    }
  }

  // Cache management
  async clearCache() {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(name => caches.delete(name))
      );
      console.log('[PWA] All caches cleared');
    }
  }

  async getCacheSize() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        quota: estimate.quota,
        usage: estimate.usage,
        usagePercentage: Math.round((estimate.usage / estimate.quota) * 100)
      };
    }
    return null;
  }

  // Share API integration
  async shareContent(shareData) {
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        console.log('[PWA] Content shared successfully');
        return true;
      } catch (error) {
        console.error('[PWA] Share failed:', error);
        return false;
      }
    }
    
    // Fallback to clipboard
    if (navigator.clipboard && shareData.url) {
      try {
        await navigator.clipboard.writeText(shareData.url);
        console.log('[PWA] URL copied to clipboard');
        return true;
      } catch (error) {
        console.error('[PWA] Clipboard write failed:', error);
        return false;
      }
    }
    
    return false;
  }
}

// Initialize PWA Manager
const pwaManager = new PWAManager();

// Export for use in React components
window.pwaManager = pwaManager;

export default pwaManager;