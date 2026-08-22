;; Appearance and Behaviour
(global-display-line-numbers-mode 1)
(blink-cursor-mode 0)

;; Disable outdated defaults
(menu-bar-mode -1)
(tool-bar-mode -1)
(scroll-bar-mode -1)
(electric-pair-mode t)
(setq inhibit-startup-screen t)


;;; Backups
(setq backup-by-copying t
      delete-old-versions t
      version-control t
      kept-new-versions 6
      kept-old-versions 2
      backup-directory-alist
      `(("." . ,(expand-file-name "backups/" user-emacs-directory)))
      auto-save-file-name-transforms
      `((".*" ,(expand-file-name "auto-save/" user-emacs-directory) t)))

(let ((backup-dir (expand-file-name "backups/" user-emacs-directory))
      (auto-save-dir (expand-file-name "auto-save/" user-emacs-directory)))
  (unless (file-exists-p backup-dir) (make-directory backup-dir t))
  (unless (file-exists-p auto-save-dir) (make-directory auto-save-dir t)))

;;; Packages Setup
(require 'package)
(add-to-list 'package-archives '("melpa" . "https://melpa.org/packages/") t)
(package-initialize)

(use-package ef-themes :ensure t)
(use-package magit :ensure t)
(use-package ace-jump-mode :ensure t)
(use-package ace-window :ensure t)
(setq aw-scope 'frame)

;;; Local Configuration
;; Excluded from git since i dont want to be pushing my configuration
;; everytime i change something insignificant such as my current
;; preferred theme
(load (expand-file-name "local.el" user-emacs-directory))

;; Custom File
(setq custom-file (expand-file-name "custom.el" user-emacs-directory))
(load custom-file)


;;; Custom Behaviour
(defun duplicate-line-follow ()
  "Duplicate current line and move to it"
  (interactive)
  (duplicate-line)
  (next-logical-line))


;;; Keybindings
(global-set-key (kbd "C-,") 'duplicate-line-follow)
(global-set-key (kbd "M-o") 'ace-window)


;;; Tramp
(setq tramp-use-scp-direct-remote-copying t
      remote-file-name-inhibit-locks t)
(put 'dired-find-alternate-file 'disabled nil)
