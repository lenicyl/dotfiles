(defun duplicate-line-follow ()
  "Duplicate current line and move to it"
  (interactive)
  (duplicate-line)
  (next-logical-line))

(provide 'duplicate-line-follow)
