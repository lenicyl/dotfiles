;; Appearance and Behaviour
(global-display-line-numbers-mode 1)
(blink-cursor-mode 0)

;; Disable outdated defaults
(menu-bar-mode -1)
(tool-bar-mode -1)
(scroll-bar-mode -1)
(setq inhibit-startup-screen t)


;;; Backups
(setq backup-by-copying t
      delete-old-versions t
      version-control t
      kept-new-versions 6
      kept-old-versions 2
      backup-directory-alist
      `(("." . ,(expand-file-name "backups/" user-emacs-directory))))


;;; Packages Setup
(require 'package)
(add-to-list 'package-archives '("melpa" . "https://melpa.org/packages/") t)
(package-initialize)

(use-package ef-themes :ensure t)


;;; Local Configuration
;; Excluded from git since i dont want to be pushing my configuration
;; everytime i change something insignificant such as my current
;; preferred theme
(load (expand-file-name "local.el" user-emacs-directory))
