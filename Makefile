# helm: set up the plugin and its companion plugin (superpowers).
# Run `make` to see the targets. setup and remove ask what to do; the work is in scripts/helm.sh.

HELM := sh scripts/helm.sh
.DEFAULT_GOAL := help
# Optional presets, passed through to the script: SCOPE=local|user FROM=here|github PIECES="…" HELM_YES=1
export SCOPE FROM PIECES HELM_YES
# make bench options: TASKS="a b" RUNS=3 MODEL=sonnet EFFORT=medium DRY=1 (list only) REPORT=1 (report only)
export TASKS RUNS MODEL EFFORT DRY REPORT

.PHONY: help setup remove status check bench
help setup remove status check bench:
	@$(HELM) $@

# Old names: still work without questions, and say what replaced them.
now = @printf '→ now: make %s\n' '$(1)' >&2
LEGACY := local global unlocal unglobal doctor install plugin plugin-remove superpowers superpowers-remove \
          update enable disable test validate
.PHONY: $(LEGACY)

local:
	$(call now,setup)
	@SCOPE=local PIECES='helm superpowers' $(HELM) setup
global:
	$(call now,setup)
	@SCOPE=user PIECES='helm superpowers' $(HELM) setup
unlocal:
	$(call now,remove)
	@SCOPE=local PIECES='helm superpowers' HELM_YES=1 $(HELM) remove
unglobal:
	$(call now,remove)
	@SCOPE=user PIECES='helm superpowers' HELM_YES=1 $(HELM) remove
doctor:
	$(call now,status)
	@$(HELM) status
install plugin:
	$(call now,setup)
	@$(HELM) install helm
superpowers:
	$(call now,setup)
	@$(HELM) install $@
plugin-remove:
	$(call now,remove)
	@$(HELM) uninstall helm
superpowers-remove:
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
