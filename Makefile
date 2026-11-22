# helm: set up the plugin, its companion tools and atlas.
# Run `make` to see the targets. setup and remove ask what to do; the work is in scripts/helm.sh.

HELM := sh scripts/helm.sh
.DEFAULT_GOAL := help
# Optional presets, passed through to the script: SCOPE=local|user FROM=here|github DIR=<repo> PIECES="…" HELM_YES=1
export SCOPE FROM DIR PIECES HELM_YES
# make bench options: TASKS="a b" RUNS=3 MODEL=sonnet EFFORT=medium DRY=1 (list only) REPORT=1 (report only)
export TASKS RUNS MODEL EFFORT DRY REPORT

.PHONY: help setup remove status index check bench
help setup remove status index check bench:
	@$(HELM) $@

# Old names: still work without questions, and say what replaced them.
now = @printf '→ now: make %s\n' '$(1)' >&2
LEGACY := local global unlocal unglobal doctor install plugin plugin-remove superpowers superpowers-remove \
          herdr atlas atlas-remove index-remove update enable disable test validate
.PHONY: $(LEGACY)

local:
	$(call now,setup)
	@SCOPE=local PIECES='helm superpowers herdr atlas' $(HELM) setup
global:
	$(call now,setup)
	@SCOPE=user PIECES='helm superpowers herdr atlas' $(HELM) setup
unlocal:
	$(call now,remove)
	@SCOPE=local PIECES='helm superpowers atlas' HELM_YES=1 $(HELM) remove
unglobal:
	$(call now,remove)
	@SCOPE=user PIECES='helm superpowers atlas' HELM_YES=1 $(HELM) remove
doctor:
	$(call now,status)
	@$(HELM) status
install plugin:
	$(call now,setup)
	@$(HELM) install helm
superpowers herdr atlas:
	$(call now,setup)
	@$(HELM) install $@
plugin-remove:
	$(call now,remove)
	@$(HELM) uninstall helm
superpowers-remove atlas-remove index-remove:
	$(call now,remove)
	@$(HELM) uninstall $(@:-remove=)
update enable disable:
	$(call now,setup)
	@$(HELM) $@
test validate:
	$(call now,check)
	@$(HELM) $@

# Anything else: a one-line hint instead of make's error.
.DEFAULT:
	@$(HELM) $@
